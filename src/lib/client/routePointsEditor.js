import L from "leaflet";
import "leaflet/dist/leaflet.css";

const ATLIXCO_CENTER = [18.9099148, -98.4368282];
const DEFAULT_ZOOM = 15;

function buildDivIcon(index, { skipStop, isSelected }) {
  const bg = skipStop ? "#9CA3AF" : isSelected ? "#F9A03F" : "#007991";
  return L.divIcon({
    className: "route-point-marker",
    html: `<div style="
      background:${bg};color:#fff;width:26px;height:26px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      font-size:12px;font-weight:700;border:2px solid white;
      box-shadow:0 1px 4px rgba(0,0,0,0.4);
    ">${index + 1}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

// Decodificador de polyline de OSRM (igual al usado en RouteMap.jsx / mapService.js)
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
    const latitude_change = result & 1 ? ~(result >> 1) : result >> 1;

    shift = result = 0;
    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const longitude_change = result & 1 ? ~(result >> 1) : result >> 1;

    lat += latitude_change;
    lng += longitude_change;
    coordinates.push([lat / factor, lng / factor]);
  }
  return coordinates;
}

/**
 * Editor visual de los puntos de una plantilla de ruta.
 *
 * El admin trabaja sobre el mapa (clic para agregar, arrastrar para
 * ajustar, lista para reordenar/omitir parada/eliminar) y esta clase
 * mantiene el arreglo `points` internamente. El trazado entre puntos se
 * calcula con OSRM (perfil "driving"), por lo que respeta el sentido de
 * circulacion vehicular real (calles de un solo sentido, vueltas
 * prohibidas, etc.) en vez de dibujar una linea recta entre puntos.
 * Si `isLoop` esta activo, se agrega el primer punto al final para que
 * el trazado cierre el circuito (primer punto <-> ultimo punto).
 */
export class RoutePointsEditor {
  constructor({
    mapContainer,
    listContainer,
    initialPoints = [],
    referenceRoute = null,
    isLoop = false,
    onChange,
  }) {
    this.points = initialPoints.map((p) => ({ ...p }));
    this.history = [this.clonePoints()];
    this.historyIndex = 0;
    this.onChange = onChange || (() => {});
    this.selectedIndex = null;
    this.listContainer = listContainer;
    this.isLoop = !!isLoop;
    this.routeRequestId = 0; // para descartar respuestas de OSRM que ya quedaron obsoletas

    this.markersLayer = L.layerGroup();
    this.lineLayer = L.layerGroup();
    this.referenceLayer = L.layerGroup();

    const initialCenter = this.points[0]
      ? [this.points[0].lat, this.points[0].lng]
      : ATLIXCO_CENTER;
    this.map = L.map(mapContainer).setView(initialCenter, DEFAULT_ZOOM);

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
      {
        attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
      },
    ).addTo(this.map);

    this.referenceLayer.addTo(this.map);
    this.lineLayer.addTo(this.map);
    this.markersLayer.addTo(this.map);

    this.setReferenceRoute(referenceRoute);

    this.map.on("click", (e) => {
      this.addPoint({ lat: e.latlng.lat, lng: e.latlng.lng, skipStop: false });
    });

    requestAnimationFrame(() => this.map.invalidateSize());
    setTimeout(() => this.map.invalidateSize(), 250);

    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.map.invalidateSize());
      this.resizeObserver.observe(mapContainer);
    }

    this.handleKeyDown = this.handleKeyDown.bind(this);
    document.addEventListener("keydown", this.handleKeyDown);

    this.render();
  }

  setReferenceRoute(points) {
    this.referenceLayer.clearLayers();
    if (!points || points.length < 2) return;

    const latlngs = points.map((p) => [p.lat, p.lng]);
    L.polyline(latlngs, {
      color: "#6B7280",
      weight: 3,
      opacity: 0.7,
      dashArray: "6 6",
    }).addTo(this.referenceLayer);

    points.forEach((p) => {
      L.circleMarker([p.lat, p.lng], {
        radius: 4,
        color: "#6B7280",
        fillColor: "#6B7280",
        fillOpacity: 0.8,
        weight: 1,
      }).addTo(this.referenceLayer);
    });
  }

  handleKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "z") {
      e.preventDefault();
      this.undo();
    } else if (
      (e.ctrlKey || e.metaKey) &&
      (e.key === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))
    ) {
      e.preventDefault();
      this.redo();
    }
  }

  destroy() {
    document.removeEventListener("keydown", this.handleKeyDown);
    this.resizeObserver?.disconnect();
    this.map.remove();
  }

  clonePoints() {
    return this.points.map((p) => ({ ...p }));
  }

  pushHistory() {
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(this.clonePoints());
    this.historyIndex = this.history.length - 1;
  }

  undo() {
    if (this.historyIndex === 0) return;
    this.historyIndex -= 1;
    this.points = this.history[this.historyIndex].map((p) => ({ ...p }));
    this.render();
  }

  redo() {
    if (this.historyIndex >= this.history.length - 1) return;
    this.historyIndex += 1;
    this.points = this.history[this.historyIndex].map((p) => ({ ...p }));
    this.render();
  }

  addPoint(point) {
    this.points.push(point);
    if (this.points.length === 1) {
      this.map.setView([point.lat, point.lng], this.map.getZoom());
    }
    this.pushHistory();
    this.render();
  }

  updatePoint(index, patch) {
    this.points[index] = { ...this.points[index], ...patch };
    this.pushHistory();
    this.render();
  }

  removePoint(index) {
    this.points.splice(index, 1);
    if (this.selectedIndex === index) this.selectedIndex = null;
    this.pushHistory();
    this.render();
  }

  movePoint(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= this.points.length) return;
    const [moved] = this.points.splice(index, 1);
    this.points.splice(target, 0, moved);
    this.pushHistory();
    this.render();
  }

  clearAll() {
    if (this.points.length === 0) return;
    if (!confirm("Borrar todos los puntos del trazado?")) return;
    this.points = [];
    this.pushHistory();
    this.render();
  }

  /** Activa/desactiva que el trazado cierre el circuito (ultimo punto -> primero). */
  setLoop(isLoop) {
    this.isLoop = !!isLoop;
    this.render();
  }

  getIsLoop() {
    return this.isLoop;
  }

  getPoints() {
    return this.clonePoints();
  }

  render() {
    this.markersLayer.clearLayers();
    this.renderGeneration = (this.renderGeneration || 0) + 1; // invalida fetches de OSRM en vuelo de renders anteriores

    this.points.forEach((point, index) => {
      const marker = L.marker([point.lat, point.lng], {
        draggable: true,
        icon: buildDivIcon(index, {
          skipStop: point.skipStop,
          isSelected: this.selectedIndex === index,
        }),
      });

      marker.on("dragend", (e) => {
        const { lat, lng } = e.target.getLatLng();
        this.updatePoint(index, { lat, lng });
      });

      marker.on("click", () => {
        this.selectedIndex = index;
        this.render();
        this.scrollListTo(index);
      });

      marker.addTo(this.markersLayer);
    });

    this.drawRouteLine();
    this.renderList();
    this.onChange(this.getPoints());
  }

  /**
   * Parte el trazado en "corridas": tramos consecutivos que se rutean por
   * OSRM (respetando calles) y tramos individuales marcados como
   * `manualSegment`, que se dibujan en linea recta sin pasar por el motor
   * de ruteo. Esto es lo que permite manejar obras: sentido cambiado
   * temporalmente, o una calle que aun no existe en el mapa base.
   */
  buildSegments(orderedPoints) {
    const segments = [];
    let roadRun = [];

    for (let i = 0; i < orderedPoints.length - 1; i++) {
      const from = orderedPoints[i];
      const to = orderedPoints[i + 1];

      if (from.manualSegment) {
        if (roadRun.length >= 2)
          segments.push({ type: "road", points: roadRun });
        roadRun = [];
        segments.push({ type: "manual", points: [from, to] });
      } else {
        if (roadRun.length === 0) roadRun.push(from);
        roadRun.push(to);
      }
    }
    if (roadRun.length >= 2) segments.push({ type: "road", points: roadRun });
    return segments;
  }

  drawRouteLine() {
    this.lineLayer.clearLayers();
    if (this.points.length < 2) return;

    const generation = this.renderGeneration;
    const orderedPoints = this.isLoop
      ? [...this.points, this.points[0]]
      : this.points;
    const segments = this.buildSegments(orderedPoints);

    segments.forEach((segment) => {
      const latlngs = segment.points.map((p) => [p.lat, p.lng]);

      if (segment.type === "manual") {
        // Tramo forzado por el admin (obra, sentido cambiado, calle no mapeada, etc.)
        L.polyline(latlngs, {
          color: "#F9A03F",
          weight: 4,
          opacity: 0.9,
          dashArray: "4 4",
        }).addTo(this.lineLayer);
        return;
      }

      const placeholder = L.polyline(latlngs, {
        color: "#007991",
        weight: 4,
        opacity: 0.5,
        dashArray: "2 8",
      }).addTo(this.lineLayer);
      this.fetchRoadSegment(segment.points, placeholder, generation);
    });
  }

  async fetchRoadSegment(segmentPoints, placeholder, generation) {
    try {
      const coordinates = segmentPoints
        .map((p) => `${p.lng},${p.lat}`)
        .join(";");
      const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=polyline&steps=false`;
      const response = await fetch(url);
      const data = await response.json();

      if (generation !== this.renderGeneration) return; // el usuario ya siguio editando, esta respuesta ya no aplica

      if (data.code === "Ok" && data.routes?.[0]?.geometry) {
        const roadCoordinates = decodePolyline(data.routes[0].geometry);
        this.lineLayer.removeLayer(placeholder);
        L.polyline(roadCoordinates, {
          color: "#007991",
          weight: 4,
          opacity: 0.85,
        }).addTo(this.lineLayer);
      }
      // Si OSRM no puede rutear ese tramo, se deja la linea recta placeholder como respaldo.
    } catch (err) {
      console.warn(
        "[RoutePointsEditor] No se pudo calcular un tramo por calles, se deja la linea recta:",
        err,
      );
    }
  }

  scrollListTo(index) {
    const row = this.listContainer?.querySelector(
      `[data-point-index="${index}"]`,
    );
    row?.scrollIntoView({ block: "nearest" });
  }

  renderList() {
    if (!this.listContainer) return;

    if (this.points.length === 0) {
      this.listContainer.innerHTML =
        '<p class="text-sm text-ar-oxford-disabled p-3">Haz clic en el mapa para agregar el primer punto.</p>';
      return;
    }

    this.listContainer.innerHTML = this.points
      .map((point, index) => {
        const selectedClass =
          this.selectedIndex === index ? "bg-ar-cerulean-disabled/40" : "";
        return `
        <div data-point-index="${index}" class="flex items-center gap-2 px-3 py-2 border-b border-gray-100 text-xs ${selectedClass}">
          <span class="font-semibold w-5">${index + 1}</span>
          <span class="flex-1 font-mono text-gray-600">${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}</span>
          <label class="flex items-center gap-1 cursor-pointer select-none whitespace-nowrap">
            <input type="checkbox" data-role="skip-stop" data-index="${index}" ${point.skipStop ? "checked" : ""} />
            Omitir parada
          </label>
          <label class="flex items-center gap-1 cursor-pointer select-none whitespace-nowrap"
              title="Traza este tramo en linea recta en vez de por calles (usar si el sentido cambio por obra o la calle no esta en el mapa)">
          <input type="checkbox" data-role="manual-segment" data-index="${index}"
            ${point.manualSegment ? "checked" : ""}
            ${index === this.points.length - 1 && !this.isLoop ? "disabled" : ""} />
          Tramo manual
          </label>
          <button type="button" data-role="move-up" data-index="${index}" class="px-1 hover:text-ar-cerulean" ${index === 0 ? "disabled" : ""}>&uarr;</button>
          <button type="button" data-role="move-down" data-index="${index}" class="px-1 hover:text-ar-cerulean" ${index === this.points.length - 1 ? "disabled" : ""}>&darr;</button>
          <button type="button" data-role="delete" data-index="${index}" class="px-1 text-ar-folly hover:underline">Eliminar</button>
        </div>`;
      })
      .join("");

    this.listContainer
      .querySelectorAll('[data-role="skip-stop"]')
      .forEach((el) => {
        el.addEventListener("change", (e) => {
          const index = Number(e.target.dataset.index);
          this.updatePoint(index, { skipStop: e.target.checked });
        });
      });
    this.listContainer
      .querySelectorAll('[data-role="move-up"]')
      .forEach((el) => {
        el.addEventListener("click", (e) =>
          this.movePoint(Number(e.currentTarget.dataset.index), -1),
        );
      });
    this.listContainer
      .querySelectorAll('[data-role="move-down"]')
      .forEach((el) => {
        el.addEventListener("click", (e) =>
          this.movePoint(Number(e.currentTarget.dataset.index), 1),
        );
      });
    this.listContainer
      .querySelectorAll('[data-role="delete"]')
      .forEach((el) => {
        el.addEventListener("click", (e) =>
          this.removePoint(Number(e.currentTarget.dataset.index)),
        );
      });
    this.listContainer
      .querySelectorAll('[data-role="manual-segment"]')
      .forEach((el) => {
        el.addEventListener("change", (e) => {
          const index = Number(e.target.dataset.index);
          this.updatePoint(index, { manualSegment: e.target.checked });
        });
      });
  }
}
