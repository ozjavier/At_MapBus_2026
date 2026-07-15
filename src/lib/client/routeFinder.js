import L from "leaflet";
import "leaflet/dist/leaflet.css";

const ATLIXCO_CENTER = [18.9099148, -98.4368282];
const DEFAULT_ZOOM = 15;
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const OSRM_URL = "https://router.project-osrm.org/route/v1/driving/";

// Radio de "ya llegaste caminando" antes de considerar que una ruta no
// sirve para este viaje. No excluye resultados, solo se usa para avisar
// al usuario cuando la caminata es larga.
const WALK_WARNING_METERS = 900;

// --- Utilidades geograficas -------------------------------------------------

function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function nearestPointIndex(points, target) {
  let bestIndex = 0;
  let bestDistance = Infinity;
  points.forEach((p, i) => {
    const d = haversineMeters(p, target);
    if (d < bestDistance) {
      bestDistance = d;
      bestIndex = i;
    }
  });
  return { index: bestIndex, distance: bestDistance };
}

// Decodificador de polyline de OSRM (igual al usado en el editor de rutas).
function decodePolyline(str, precision = 5) {
  let index = 0,
    lat = 0,
    lng = 0,
    coordinates = [],
    shift = 0,
    result = 0,
    byte = null;
  const factor = Math.pow(10, precision);

  while (index < str.length) {
    byte = null;
    shift = 0;
    result = 0;
    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;

    shift = result = 0;
    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;

    lat += dlat;
    lng += dlng;
    coordinates.push([lat / factor, lng / factor]);
  }
  return coordinates;
}

// Construye la secuencia de indices que hay que recorrer dentro de una
// ruta para ir del punto de abordaje al de bajada, respetando el sentido
// de circulacion guardado en `points`. Si la ruta es en bucle y el punto
// de bajada quedo "antes" que el de abordaje, se rodea por el resto del
// circuito en vez de descartar la recomendacion.
function buildBoardingSegment(route, boardIndex, alightIndex) {
  const n = route.points.length;
  if (boardIndex === alightIndex) return null;

  if (boardIndex < alightIndex) {
    const indices = [];
    for (let i = boardIndex; i <= alightIndex; i++) indices.push(i);
    return { indices, reversed: false };
  }

  if (route.isLoop) {
    const indices = [];
    for (let i = boardIndex; i < n; i++) indices.push(i);
    for (let i = 0; i <= alightIndex; i++) indices.push(i);
    return { indices, reversed: false };
  }

  // Ruta no circular y el destino queda "antes" en el trazado: solo tiene
  // sentido si se toma en direccion contraria (vuelta).
  const indices = [];
  for (let i = boardIndex; i >= alightIndex; i--) indices.push(i);
  return { indices, reversed: true };
}

function segmentDistanceMeters(route, indices) {
  let total = 0;
  for (let i = 0; i < indices.length - 1; i++) {
    total += haversineMeters(
      route.points[indices[i]],
      route.points[indices[i + 1]],
    );
  }
  return total;
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return "—";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function estimateMinutes(walkMeters, busMeters) {
  const walkMinutes = walkMeters / (5000 / 60); // ~5 km/h caminando
  const busMinutes = busMeters / (18000 / 60); // ~18 km/h en camion urbano
  return Math.max(1, Math.round(walkMinutes + busMinutes));
}

// --- Clase principal ---------------------------------------------------

export class RouteFinderApp {
  constructor({
    mapContainer,
    routes,
    startInput,
    endInput,
    startSuggestions,
    endSuggestions,
    startPickBtn,
    endPickBtn,
    searchBtn,
    clearBtn,
    locateBtn,
    resultsContainer,
    statusContainer,
    mapErrorContainer,
    onSelectingChange,
  }) {
    this.routes = routes ?? [];
    this.startInput = startInput;
    this.endInput = endInput;
    this.startSuggestions = startSuggestions;
    this.endSuggestions = endSuggestions;
    this.startPickBtn = startPickBtn;
    this.endPickBtn = endPickBtn;
    this.searchBtn = searchBtn;
    this.clearBtn = clearBtn;
    this.locateBtn = locateBtn;
    this.resultsContainer = resultsContainer;
    this.statusContainer = statusContainer;
    this.mapErrorContainer = mapErrorContainer;
    this.onSelectingChange = onSelectingChange ?? (() => {});

    this.start = null; // { lat, lng, label }
    this.end = null;
    this.selecting = null; // 'start' | 'end' | null
    this.recommendations = [];
    this.selectedRecommendation = null;
    this.geocodeTimers = { start: null, end: null };

    // Los iconos por defecto de Leaflet apuntan a rutas relativas que Vite
    // no resuelve al empaquetar (el clasico "marcador roto"). Se apuntan a
    // una CDN para evitarlo; esto no afecta al mapa en si, solo a los pines.
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl:
        "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl:
        "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });

    if (!mapContainer) {
      console.error(
        "RouteFinderApp: no se encontro el contenedor del mapa (#finder-map).",
      );
      this.showMapError();
      return;
    }

    try {
      this.map = L.map(mapContainer, {
        center: ATLIXCO_CENTER,
        zoom: DEFAULT_ZOOM,
      });
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        {
          attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
        },
      ).addTo(this.map);

      this.markersLayer = L.layerGroup().addTo(this.map);
      this.routeLayer = L.layerGroup().addTo(this.map);

      this.map.on("click", (e) => this.handleMapClick(e.latlng));

      // Si el contenedor cambia de tamano despues de inicializar el mapa
      // (por ejemplo el layout todavia se estaba acomodando, o se
      // colapsa/expande un panel), Leaflet necesita que se le avise para
      // recalcular tiles; si no, el mapa se queda "congelado" o en blanco.
      requestAnimationFrame(() => this.map.invalidateSize());
      window.addEventListener("resize", () => this.map.invalidateSize());
      if (typeof ResizeObserver !== "undefined") {
        new ResizeObserver(() => this.map.invalidateSize()).observe(
          mapContainer,
        );
      }
    } catch (error) {
      console.error("Error iniciando el mapa:", error);
      this.showMapError();
      return;
    }

    this.wireInputs();
    this.wireButtons();
    this.renderMarkers();
    this.updateSearchButtonState();
  }

  showMapError() {
    this.mapErrorContainer?.classList.remove("hidden");
  }

  // --- Wiring de UI ---

  wireInputs() {
    this.startInput?.addEventListener("input", () =>
      this.scheduleGeocode("start"),
    );
    this.endInput?.addEventListener("input", () => this.scheduleGeocode("end"));

    document.addEventListener("click", (e) => {
      if (
        this.startSuggestions &&
        !this.startSuggestions.contains(e.target) &&
        e.target !== this.startInput
      ) {
        this.startSuggestions.classList.add("hidden");
      }
      if (
        this.endSuggestions &&
        !this.endSuggestions.contains(e.target) &&
        e.target !== this.endInput
      ) {
        this.endSuggestions.classList.add("hidden");
      }
    });
  }

  wireButtons() {
    this.startPickBtn?.addEventListener("click", () =>
      this.toggleSelecting("start"),
    );
    this.endPickBtn?.addEventListener("click", () =>
      this.toggleSelecting("end"),
    );
    this.searchBtn?.addEventListener("click", () => this.findRoutes());
    this.clearBtn?.addEventListener("click", () => this.reset());
    this.locateBtn?.addEventListener("click", () => this.useCurrentLocation());
  }

  toggleSelecting(type) {
    this.selecting = this.selecting === type ? null : type;
    this.onSelectingChange(this.selecting);
    this.startPickBtn?.classList.toggle("ring-2", this.selecting === "start");
    this.startPickBtn?.classList.toggle(
      "ring-ar-cerulean",
      this.selecting === "start",
    );
    this.endPickBtn?.classList.toggle("ring-2", this.selecting === "end");
    this.endPickBtn?.classList.toggle(
      "ring-ar-cerulean",
      this.selecting === "end",
    );
  }

  // --- Geocodificacion (Nominatim / OpenStreetMap) ---

  scheduleGeocode(type) {
    clearTimeout(this.geocodeTimers[type]);
    const input = type === "start" ? this.startInput : this.endInput;
    const query = input?.value?.trim();
    if (!query || query.length < 3) {
      this.hideSuggestions(type);
      return;
    }
    this.geocodeTimers[type] = setTimeout(
      () => this.runGeocode(type, query),
      400,
    );
  }

  async runGeocode(type, query) {
    try {
      const url = `${NOMINATIM_URL}?format=json&limit=5&countrycodes=mx&q=${encodeURIComponent(
        `${query}, Atlixco, Puebla`,
      )}`;
      const res = await fetch(url, { headers: { "Accept-Language": "es" } });
      const data = await res.json();
      this.renderSuggestions(type, data);
    } catch (error) {
      console.error("Error de geocodificacion:", error);
    }
  }

  renderSuggestions(type, results) {
    const container =
      type === "start" ? this.startSuggestions : this.endSuggestions;
    if (!container) return;

    if (!results || results.length === 0) {
      container.innerHTML =
        '<p class="px-3 py-2 text-sm text-gray-400">Sin resultados</p>';
      container.classList.remove("hidden");
      return;
    }

    container.innerHTML = results
      .map(
        (r, i) => `
        <button type="button" data-idx="${i}"
          class="w-full text-left px-3 py-2 text-sm hover:bg-ar-cerulean-disabled">
          ${r.display_name}
        </button>`,
      )
      .join("");

    container.querySelectorAll("button[data-idx]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const r = results[Number(btn.dataset.idx)];
        const location = {
          lat: parseFloat(r.lat),
          lng: parseFloat(r.lon),
          label: r.display_name,
        };
        this.setLocation(type, location);
        this.hideSuggestions(type);
      });
    });

    container.classList.remove("hidden");
  }

  hideSuggestions(type) {
    const container =
      type === "start" ? this.startSuggestions : this.endSuggestions;
    container?.classList.add("hidden");
  }

  // --- Seleccion de puntos ---

  handleMapClick(latlng) {
    if (!this.selecting) return;
    const type = this.selecting;
    this.setLocation(type, {
      lat: latlng.lat,
      lng: latlng.lng,
      label: "Punto seleccionado en el mapa",
    });
    this.selecting = null;
    this.onSelectingChange(null);
    this.startPickBtn?.classList.remove("ring-2", "ring-ar-cerulean");
    this.endPickBtn?.classList.remove("ring-2", "ring-ar-cerulean");
  }

  setLocation(type, location) {
    if (type === "start") {
      this.start = location;
      if (this.startInput) this.startInput.value = location.label;
    } else {
      this.end = location;
      if (this.endInput) this.endInput.value = location.label;
    }
    this.map?.panTo([location.lat, location.lng]);
    this.renderMarkers();
    this.updateSearchButtonState();
  }

  useCurrentLocation() {
    if (!navigator.geolocation) {
      this.setStatus("Tu navegador no permite obtener tu ubicacion.", true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.setLocation("start", {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          label: "Mi ubicacion actual",
        });
      },
      () => this.setStatus("No se pudo obtener tu ubicacion.", true),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  renderMarkers() {
    if (!this.markersLayer) return;
    this.markersLayer.clearLayers();
    if (this.start) {
      L.marker([this.start.lat, this.start.lng], { title: "Partida" })
        .bindTooltip("Partida")
        .addTo(this.markersLayer);
    }
    if (this.end) {
      L.marker([this.end.lat, this.end.lng], { title: "Destino" })
        .bindTooltip("Destino")
        .addTo(this.markersLayer);
    }
  }

  updateSearchButtonState() {
    if (!this.searchBtn) return;
    this.searchBtn.disabled = !this.start || !this.end;
  }

  setStatus(message, isError = false) {
    if (!this.statusContainer) return;
    this.statusContainer.textContent = message;
    this.statusContainer.classList.toggle("hidden", !message);
    this.statusContainer.classList.toggle("text-ar-folly", isError);
    this.statusContainer.classList.toggle("text-ar-oxford-disabled", !isError);
  }

  // --- Calculo de recomendaciones ---

  findRoutes() {
    if (!this.start || !this.end) return;
    if (!this.routes.length) {
      this.setStatus("No hay rutas publicadas por el momento.", true);
      return;
    }

    const candidates = [];

    for (const route of this.routes) {
      if (!route.points || route.points.length < 2) continue;

      const board = nearestPointIndex(route.points, this.start);
      const alight = nearestPointIndex(route.points, this.end);
      if (board.index === alight.index) continue;

      const segment = buildBoardingSegment(route, board.index, alight.index);
      if (!segment) continue;

      const busDistance = segmentDistanceMeters(route, segment.indices);
      const totalWalk = board.distance + alight.distance;

      candidates.push({
        route,
        boardIndex: board.index,
        alightIndex: alight.index,
        walkToBoard: board.distance,
        walkFromAlight: alight.distance,
        totalWalk,
        busDistance,
        segmentIndices: segment.indices,
        reversed: segment.reversed,
        estimatedMinutes: estimateMinutes(totalWalk, busDistance),
      });
    }

    candidates.sort(
      (a, b) => a.totalWalk - b.totalWalk || a.busDistance - b.busDistance,
    );
    this.recommendations = candidates.slice(0, 5);

    if (this.recommendations.length === 0) {
      this.setStatus(
        "No se encontraron rutas que conecten esos dos puntos.",
        true,
      );
      this.renderResults();
      return;
    }

    this.setStatus("");
    this.renderResults();
    this.selectRecommendation(this.recommendations[0]);
  }

  renderResults() {
    if (!this.resultsContainer) return;

    if (this.recommendations.length === 0) {
      this.resultsContainer.innerHTML = "";
      return;
    }

    this.resultsContainer.innerHTML = this.recommendations
      .map((rec, i) => {
        const walkWarning = rec.totalWalk > WALK_WARNING_METERS;
        return `
        <button type="button" data-idx="${i}"
          class="w-full text-left p-4 rounded-md border transition-colors cursor-pointer ${
            i === 0
              ? "border-ar-cerulean bg-ar-cerulean-disabled"
              : "border-gray-200 hover:bg-gray-50"
          }">
          <div class="flex justify-between items-start">
            <div>
              <p class="font-bold text-ar-oxford">Ruta ${rec.route.routeNumber}${
                rec.route.name ? ` — ${rec.route.name}` : ""
              }</p>
              <p class="text-xs text-ar-oxford-disabled mt-0.5">${rec.route.label}${
                rec.reversed ? " (sentido contrario)" : ""
              }</p>
            </div>
            <span class="text-xs font-semibold bg-ar-oxford text-white px-2 py-1 rounded-full">
              ~${rec.estimatedMinutes} min
            </span>
          </div>
          <div class="mt-2 text-sm text-ar-oxford-disabled space-y-0.5">
            <p>Camina ${formatDistance(rec.walkToBoard)} hasta el punto de abordaje</p>
            <p>Recorrido en camion: ${formatDistance(rec.busDistance)}</p>
            <p>Camina ${formatDistance(rec.walkFromAlight)} desde la bajada hasta tu destino</p>
          </div>
          ${
            walkWarning
              ? '<p class="mt-2 text-xs text-ar-folly font-semibold">Esta ruta implica una caminata considerable.</p>'
              : ""
          }
        </button>`;
      })
      .join("");

    this.resultsContainer
      .querySelectorAll("button[data-idx]")
      .forEach((btn) => {
        btn.addEventListener("click", () => {
          this.selectRecommendation(
            this.recommendations[Number(btn.dataset.idx)],
          );
        });
      });
  }

  async selectRecommendation(rec) {
    this.selectedRecommendation = rec;
    this.renderResults();
    await this.drawRouteOnMap(rec);
  }

  async drawRouteOnMap(rec) {
    if (!this.routeLayer || !this.map) return;
    this.routeLayer.clearLayers();

    const boardPoint = rec.route.points[rec.boardIndex];
    const alightPoint = rec.route.points[rec.alightIndex];

    L.circleMarker([boardPoint.lat, boardPoint.lng], {
      radius: 7,
      color: "#007991",
      fillColor: "#007991",
      fillOpacity: 1,
    })
      .bindTooltip("Sube aqui")
      .addTo(this.routeLayer);

    L.circleMarker([alightPoint.lat, alightPoint.lng], {
      radius: 7,
      color: "#ff3366",
      fillColor: "#ff3366",
      fillOpacity: 1,
    })
      .bindTooltip("Baja aqui")
      .addTo(this.routeLayer);

    const segmentCoords = rec.segmentIndices.map((i) => rec.route.points[i]);
    const placeholder = L.polyline(
      segmentCoords.map((p) => [p.lat, p.lng]),
      { color: "#007991", weight: 4, opacity: 0.5, dashArray: "2 8" },
    ).addTo(this.routeLayer);

    // Lineas punteadas de caminata desde/hacia los puntos del usuario.
    if (this.start) {
      L.polyline(
        [
          [this.start.lat, this.start.lng],
          [boardPoint.lat, boardPoint.lng],
        ],
        { color: "#474766", weight: 3, dashArray: "6 6" },
      ).addTo(this.routeLayer);
    }
    if (this.end) {
      L.polyline(
        [
          [alightPoint.lat, alightPoint.lng],
          [this.end.lat, this.end.lng],
        ],
        { color: "#474766", weight: 3, dashArray: "6 6" },
      ).addTo(this.routeLayer);
    }

    try {
      const coordinates = segmentCoords
        .map((p) => `${p.lng},${p.lat}`)
        .join(";");
      const url = `${OSRM_URL}${coordinates}?overview=full&geometries=polyline`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.code === "Ok" && data.routes?.[0]?.geometry) {
        this.routeLayer.removeLayer(placeholder);
        const roadCoordinates = decodePolyline(data.routes[0].geometry);
        const roadLine = L.polyline(roadCoordinates, {
          color: "#007991",
          weight: 5,
          opacity: 0.85,
        }).addTo(this.routeLayer);
        this.map.fitBounds(roadLine.getBounds(), { padding: [40, 40] });
        return;
      }
    } catch (error) {
      console.error("Error trazando ruta con OSRM:", error);
    }

    this.map.fitBounds(placeholder.getBounds(), { padding: [40, 40] });
  }

  reset() {
    this.start = null;
    this.end = null;
    this.selecting = null;
    this.recommendations = [];
    this.selectedRecommendation = null;
    if (this.startInput) this.startInput.value = "";
    if (this.endInput) this.endInput.value = "";
    this.hideSuggestions("start");
    this.hideSuggestions("end");
    this.markersLayer.clearLayers();
    this.routeLayer.clearLayers();
    if (this.resultsContainer) this.resultsContainer.innerHTML = "";
    this.setStatus("");
    this.updateSearchButtonState();
    this.map.setView(ATLIXCO_CENTER, DEFAULT_ZOOM);
  }
}
