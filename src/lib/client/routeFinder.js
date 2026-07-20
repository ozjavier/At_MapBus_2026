import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { renderFavoriteStarHtml } from "./routeFavorites.js";

const ATLIXCO_CENTER = [18.9099148, -98.4368282];
const DEFAULT_ZOOM = 15;
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const OSRM_URL = "https://router.project-osrm.org/route/v1/driving/";
const OSRM_FOOT_URL = "https://router.project-osrm.org/route/v1/foot/";

// Radio de "ya llegaste caminando" antes de considerar que una ruta no
// sirve para este viaje. No excluye resultados, solo se usa para avisar
// al usuario cuando la caminata es larga.
const WALK_WARNING_METERS = 900;

// --- Iconos personalizados para el mapa ------------------------------------

function buildEndpointIcon(letter, color) {
  return L.divIcon({
    className: "",
    html: `
      <div style="width:34px;height:44px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))">
        <svg width="34" height="44" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg">
          <path d="M17 0C7.6 0 0 7.6 0 17c0 12 17 27 17 27s17-15 17-27C34 7.6 26.4 0 17 0z" fill="${color}"/>
          <circle cx="17" cy="17" r="12" fill="white"/>
          <text x="17" y="22" text-anchor="middle" font-size="14" font-weight="700" font-family="system-ui, sans-serif" fill="${color}">${letter}</text>
        </svg>
      </div>`,
    iconSize: [34, 44],
    iconAnchor: [17, 44],
    popupAnchor: [0, -40],
  });
}

function buildStopIcon(color, direction) {
  const arrowPath = direction === "up" ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6";
  return L.divIcon({
    className: "",
    html: `
      <div style="width:26px;height:26px;border-radius:50%;background:${color};
        display:flex;align-items:center;justify-content:center;
        border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4);">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <path d="${arrowPath}"></path>
        </svg>
      </div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

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

// --- Caminata via Google Routes API (con OSRM como respaldo) ---------------
//
// Se usa el endpoint propio /api/walk-directions (proxy server-side hacia
// Google Routes API, modo WALK) como motor principal para los tramos de
// caminata: es mas rapido que Overpass, no tiene limite de uso publico
// compartido, y ya resuelve internamente "caminata ignora sentido
// vehicular" sin que tengamos que mantener un grafo/Dijkstra propios. Si
// el endpoint falla (red, cuota, configuracion), se cae a OSRM con
// alternativas + menor distancia como respaldo, para no dejar el tramo
// sin dibujar.
async function fetchGoogleWalkPath(points) {
  try {
    const origin = points[0];
    const destination = points[points.length - 1];
    const res = await fetch("/api/walk-directions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origin, destination }),
    });
    if (!res.ok) {
      console.warn(`/api/walk-directions respondio ${res.status}`);
      return null;
    }
    const data = await res.json();
    if (!data?.polyline) return null;
    return decodePolyline(data.polyline);
  } catch (error) {
    console.error("Error consultando /api/walk-directions:", error);
    return null;
  }
}

async function fetchWalkPath(points) {
  const googlePath = await fetchGoogleWalkPath(points);
  if (googlePath) return googlePath;

  console.warn("Google Directions no disponible, usando OSRM como respaldo.");
  return await fetchOsrmPath(OSRM_FOOT_URL, points, { alternatives: true });
}

async function fetchOsrmPath(baseUrl, points, { alternatives = false } = {}) {
  try {
    const coordinates = points.map((p) => `${p.lng},${p.lat}`).join(";");
    const altParam = alternatives ? "&alternatives=true" : "";
    const url = `${baseUrl}${coordinates}?overview=full&geometries=polyline${altParam}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.code === "Ok" && data.routes?.length) {
      const bestRoute = alternatives
        ? data.routes.reduce(
            (best, r) => (r.distance < best.distance ? r : best),
            data.routes[0],
          )
        : data.routes[0];
      return decodePolyline(bestRoute.geometry);
    }
  } catch (error) {
    console.error(`Error consultando OSRM (${baseUrl}):`, error);
  }
  return null; // si falla, quien llame decide el fallback (ej. mantener la linea recta)
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
    return { indices };
  }

  if (route.isLoop) {
    const indices = [];
    for (let i = boardIndex; i < n; i++) indices.push(i);
    for (let i = 0; i <= alightIndex; i++) indices.push(i);
    return { indices };
  }

  // Ruta no circular y el destino queda "antes" en el trazado: esta ruta
  // no puede llevar al pasajero ahi. No existe "vuelta" implicita — el
  // camion solo circula en el sentido en que fue trazada la plantilla.
  // Se descarta como candidata en vez de simular un recorrido inverso
  // que no corresponde a ningun servicio real.
  return null;
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
    favoriteIds,
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
    this.favoriteIds = new Set(favoriteIds ?? []);

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
      this.routeLayer = L.featureGroup().addTo(this.map);

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
      L.marker([this.start.lat, this.start.lng], {
        title: "Origen",
        icon: buildEndpointIcon("A", "#007991"),
        zIndexOffset: 500,
      })
        .bindTooltip("Origen", { direction: "top", offset: [0, -38] })
        .addTo(this.markersLayer);
    }
    if (this.end) {
      L.marker([this.end.lat, this.end.lng], {
        title: "Destino",
        icon: buildEndpointIcon("B", "#ff3366"),
        zIndexOffset: 500,
      })
        .bindTooltip("Destino", { direction: "top", offset: [0, -38] })
        .addTo(this.markersLayer);
    }
  }

  updateSearchButtonState() {
    if (!this.searchBtn) return;
    this.searchBtn.disabled = !this.start || !this.end;
  }

  setStatus(message, isError = false) {
    if (!this.statusContainer) return;
    if (!message) {
      this.statusContainer.innerHTML = "";
      this.statusContainer.classList.add("hidden");
      return;
    }
    const icon = isError
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><path d="M12 3 2 20h20L12 3z"></path><path d="M12 9v5"></path><circle cx="12" cy="17" r="0.5" fill="currentColor"></circle></svg>'
      : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><circle cx="12" cy="12" r="9"></circle><path d="M12 8v5M12 16h.01"></path></svg>';
    this.statusContainer.innerHTML = `<span class="flex items-center gap-1.5">${icon}${message}</span>`;
    this.statusContainer.classList.remove("hidden");
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

    const walkIcon =
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" class="shrink-0"><ellipse cx="8" cy="17" rx="2" ry="3" transform="rotate(-15 8 17)"/><ellipse cx="16" cy="9" rx="2" ry="3" transform="rotate(15 16 9)"/></svg>';
    const busIcon =
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><rect x="3" y="6" width="18" height="10" rx="2"></rect><circle cx="7.5" cy="18" r="1.5"></circle><circle cx="16.5" cy="18" r="1.5"></circle><path d="M3 11h18"></path></svg>';
    const clockIcon =
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 3"></path></svg>';
    const warningIcon =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><path d="M12 3 2 20h20L12 3z"></path><path d="M12 9v5"></path><circle cx="12" cy="17" r="0.5" fill="currentColor"></circle></svg>';

    this.resultsContainer.innerHTML = this.recommendations
      .map((rec, i) => {
        const walkWarning = rec.totalWalk > WALK_WARNING_METERS;
        const isFavorite = this.favoriteIds.has(rec.route.groupId);
        // Envoltura relative + botón de estrella absoluto en la esquina:
        // el botón de "seleccionar" ocupa toda la tarjeta como antes, y la
        // estrella queda encima como hermano (nunca anidada dentro de otro
        // <button>, que es HTML inválido y rompería su propio clic).
        return `
      <div class="relative">
        <button type="button" data-select-idx="${i}"
          class="w-full text-left p-4 pr-12 rounded-md border transition-colors cursor-pointer ${
            i === 0
              ? "border-ar-cerulean bg-ar-cerulean-disabled"
              : "border-gray-200 hover:bg-gray-50"
          }">
          <div class="flex justify-between items-start gap-2">
            <div class="flex items-start gap-2">
              <span class="mt-0.5 shrink-0 w-6 h-6 rounded-md bg-ar-oxford text-white flex items-center justify-center">
                ${busIcon}
              </span>
              <div>
                <p class="font-bold text-ar-oxford">Ruta ${rec.route.routeNumber}${
                  rec.route.name ? ` — ${rec.route.name}` : ""
                }</p>
                <p class="text-xs text-ar-oxford-disabled mt-0.5">${rec.route.label}${
                  rec.reversed ? " (sentido contrario)" : ""
                }</p>
              </div>
            </div>
            <span class="shrink-0 flex items-center gap-1 text-xs font-semibold bg-ar-oxford text-white px-2 py-1 rounded-full">
              ${clockIcon} ~${rec.estimatedMinutes} min
            </span>
          </div>
          <div class="mt-2 text-sm text-ar-oxford-disabled space-y-1">
            <p class="flex items-center gap-1.5">${walkIcon} Camina ${formatDistance(rec.walkToBoard)} hasta el punto de abordaje</p>
            <p class="flex items-center gap-1.5">${busIcon} Recorrido en camión: ${formatDistance(rec.busDistance)}</p>
            <p class="flex items-center gap-1.5">${walkIcon} Camina ${formatDistance(rec.walkFromAlight)} desde la bajada hasta tu destino</p>
          </div>
          ${
            walkWarning
              ? `<p class="mt-2 flex items-center gap-1.5 text-xs text-ar-folly font-semibold">${warningIcon} Esta ruta implica una caminata considerable.</p>`
              : ""
          }
        </button>
        <span class="absolute top-3 right-3">${renderFavoriteStarHtml(rec.route.groupId, isFavorite)}</span>
      </div>`;
      })
      .join("");

    this.resultsContainer
      .querySelectorAll("button[data-select-idx]")
      .forEach((btn) => {
        btn.addEventListener("click", () => {
          this.selectRecommendation(
            this.recommendations[Number(btn.dataset.selectIdx)],
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

    L.marker([boardPoint.lat, boardPoint.lng], {
      icon: buildStopIcon("#007991", "up"),
      zIndexOffset: 400,
    })
      .bindTooltip("Sube aquí", { direction: "top", offset: [0, -16] })
      .addTo(this.routeLayer);

    L.marker([alightPoint.lat, alightPoint.lng], {
      icon: buildStopIcon("#ff3366", "down"),
      zIndexOffset: 400,
    })
      .bindTooltip("Baja aquí", { direction: "top", offset: [0, -16] })
      .addTo(this.routeLayer);

    const segmentCoords = rec.segmentIndices.map((i) => rec.route.points[i]);

    // Placeholders: se ven de inmediato mientras OSRM responde.
    const busPlaceholder = L.polyline(
      segmentCoords.map((p) => [p.lat, p.lng]),
      { color: "#007991", weight: 4, opacity: 0.5, dashArray: "2 8" },
    ).addTo(this.routeLayer);

    const walkToBoardPlaceholder = this.start
      ? L.polyline(
          [
            [this.start.lat, this.start.lng],
            [boardPoint.lat, boardPoint.lng],
          ],
          { color: "#474766", weight: 3, dashArray: "6 6", opacity: 0.6 },
        ).addTo(this.routeLayer)
      : null;

    const walkFromAlightPlaceholder = this.end
      ? L.polyline(
          [
            [alightPoint.lat, alightPoint.lng],
            [this.end.lat, this.end.lng],
          ],
          { color: "#474766", weight: 3, dashArray: "6 6", opacity: 0.6 },
        ).addTo(this.routeLayer)
      : null;

    // Se piden los tres tramos en paralelo: caminata hacia la parada,
    // caminata desde la bajada, y el recorrido en camion (perfil
    // vehicular). Los tramos de caminata pasan por fetchWalkPath, que
    // calcula el camino mas corto real calle por calle sobre un grafo
    // propio construido a partir de OSM (sin ninguna restriccion de
    // sentido vehicular), usando OSRM solo como respaldo si ese calculo
    // falla. El tramo en camion sigue el trazado fijo del RouteGroup y no
    // necesita ninguno de estos ajustes.
    const [walkToBoardPath, walkFromAlightPath, busPath] = await Promise.all([
      this.start ? fetchWalkPath([this.start, boardPoint]) : null,
      this.end ? fetchWalkPath([alightPoint, this.end]) : null,
      fetchOsrmPath(OSRM_URL, segmentCoords),
    ]);

    if (walkToBoardPath) {
      this.routeLayer.removeLayer(walkToBoardPlaceholder);
      L.polyline(walkToBoardPath, {
        color: "#474766",
        weight: 3,
        dashArray: "6 6",
        opacity: 0.85,
      }).addTo(this.routeLayer);
    }

    if (walkFromAlightPath) {
      this.routeLayer.removeLayer(walkFromAlightPlaceholder);
      L.polyline(walkFromAlightPath, {
        color: "#474766",
        weight: 3,
        dashArray: "6 6",
        opacity: 0.85,
      }).addTo(this.routeLayer);
    }

    if (busPath) {
      this.routeLayer.removeLayer(busPlaceholder);
      L.polyline(busPath, {
        color: "#007991",
        weight: 5,
        opacity: 0.85,
      }).addTo(this.routeLayer);
    }

    const bounds = this.routeLayer.getBounds();
    if (bounds.isValid()) {
      this.map.fitBounds(bounds, { padding: [40, 40] });
    }
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
