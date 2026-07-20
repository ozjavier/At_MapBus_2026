import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { renderFavoriteStarHtml } from "./routeFavorites.js";

const ATLIXCO_CENTER = [18.9099148, -98.4368282];
const DEFAULT_ZOOM = 14;

// Paleta inspirada en las líneas del Metro de la CDMX: colores saturados y
// bien diferenciables entre sí incluso en trazados muy cercanos.
const LINE_COLORS = [
  "#e0201f", // rojo
  "#00833e", // verde
  "#f75e91", // rosa
  "#f2d219", // amarillo
  "#0072bb", // azul
  "#f47a20", // naranja
  "#754c29", // café
  "#a4ce4e", // verde limón
  "#8f9296", // gris
  "#00a99d", // turquesa
  "#7b2e8d", // morado
  "#b79a2c", // dorado / mostaza
  "#d4145a", // magenta
  "#0f9b8e", // verde azulado
  "#c1272d", // rojo oscuro
];

const OPACITY = { normal: 0.85, selected: 1, dimmed: 0.15 };
const WEIGHT = { normal: 5, selected: 6, dimmed: 4 };
const STOP_RADIUS = { normal: 5, hover: 7, terminal: 8 };

export class RoutesOverviewMap {
  /**
   * @param {Object} opts
   * @param {HTMLElement} opts.mapContainer
   * @param {Array} opts.routes - salida de listActiveRoutesForFinder()
   * @param {HTMLElement} opts.listContainer
   * @param {HTMLElement} [opts.mapErrorContainer]
   * @param {HTMLElement} [opts.emptyStateContainer]
   * @param {Array<string>} [opts.favoriteIds] - route_group_id del usuario logueado
   */
  constructor({
    mapContainer,
    routes,
    listContainer,
    mapErrorContainer,
    emptyStateContainer,
    favoriteIds,
  }) {
    this.routes = Array.isArray(routes) ? routes : [];
    this.listContainer = listContainer;
    this.mapErrorContainer = mapErrorContainer;
    this.emptyStateContainer = emptyStateContainer;
    this.favoriteIds = new Set(favoriteIds ?? []);

    // groupId -> { color, route, polyline, stopMarkers: L.CircleMarker[], arrowMarkers: L.Marker[] }
    this.lines = new Map();
    this.selectedId = null;

    if (!mapContainer) {
      console.error(
        "RoutesOverviewMap: no se encontró el contenedor del mapa (#routes-map).",
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
        { attribution: "&copy; OpenStreetMap contributors &copy; CARTO" },
      ).addTo(this.map);

      // El contenedor puede cambiar de tamaño después de inicializar el
      // mapa (layout todavía acomodándose); sin este aviso, Leaflet se
      // queda con los tiles congelados o en blanco.
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

    if (this.routes.length === 0) {
      this.emptyStateContainer?.classList.remove("hidden");
      return;
    }

    this.drawRoutes();
    this.renderList();
  }

  showMapError() {
    this.mapErrorContainer?.classList.remove("hidden");
  }

  colorFor(index) {
    return LINE_COLORS[index % LINE_COLORS.length];
  }

  // --- Dibujo ---------------------------------------------------------

  drawRoutes() {
    if (!this.map) return;
    const allBoundsPoints = [];

    this.routes.forEach((route, index) => {
      const points = Array.isArray(route.points) ? route.points : [];
      if (points.length < 2) return;

      const color = this.colorFor(index);
      const orderedPoints = route.isLoop ? [...points, points[0]] : points;
      const latlngs = orderedPoints.map((p) => [p.lat, p.lng]);

      // --- Línea del recorrido ---
      const polyline = L.polyline(latlngs, {
        color,
        weight: WEIGHT.normal,
        opacity: OPACITY.normal,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(this.map);

      polyline.bindTooltip(this.routeLabel(route), { sticky: true });
      polyline.on("click", () => this.selectRoute(route.groupId));
      polyline.on("mouseover", () => this.previewHover(route.groupId, true));
      polyline.on("mouseout", () => this.previewHover(route.groupId, false));

      // --- Flechas de sentido ---
      const arrowMarkers = this.buildDirectionArrows(orderedPoints, color);
      arrowMarkers.forEach((marker) => {
        marker.addTo(this.map);
        marker.on("click", () => this.selectRoute(route.groupId));
      });

      // --- Paradas (círculos) ---
      // Solo los puntos que NO son "solo trazado" (skipStop) son paradas
      // reales donde se puede abordar/descender.
      const boardablePoints = points.filter((p) => !p.skipStop);
      const stopMarkers = boardablePoints.map((point, stopIndex) => {
        const isTerminal = stopIndex === 0 && !route.isLoop;
        const marker = this.buildStopMarker(point, color, {
          isTerminal,
          label: isTerminal
            ? `${this.routeLabel(route)} — inicio de ruta`
            : `${this.routeLabel(route)} — parada ${stopIndex + 1}`,
        });
        marker.addTo(this.map);
        marker.on("click", () => this.selectRoute(route.groupId));
        return marker;
      });

      this.lines.set(route.groupId, {
        color,
        route,
        polyline,
        stopMarkers,
        arrowMarkers,
      });
      allBoundsPoints.push(...latlngs);
    });

    if (allBoundsPoints.length > 0) {
      this.map.fitBounds(allBoundsPoints, { padding: [40, 40] });
    }
  }

  routeLabel(route) {
    return `Ruta ${route.routeNumber}${route.name ? ` — ${route.name}` : ""}`;
  }

  // Círculo de parada: sólido y pequeño para paradas normales; anillo hueco
  // y un poco más grande para el punto de inicio (referencia visual clara
  // de "aquí comienza el recorrido", igual que una terminal de metro).
  buildStopMarker(point, color, { isTerminal, label }) {
    const marker = L.circleMarker([point.lat, point.lng], {
      radius: isTerminal ? STOP_RADIUS.terminal : STOP_RADIUS.normal,
      weight: isTerminal ? 3 : 2,
      color: isTerminal ? color : "#ffffff",
      fillColor: isTerminal ? "#ffffff" : color,
      fillOpacity: OPACITY.normal,
      opacity: OPACITY.normal,
    });
    marker.bindTooltip(label, { direction: "top", offset: [0, -6] });
    marker.on("mouseover", () => {
      if (!marker.options._dimmed)
        marker.setRadius(
          (isTerminal ? STOP_RADIUS.terminal : STOP_RADIUS.normal) + 2,
        );
    });
    marker.on("mouseout", () => {
      if (!marker.options._dimmed)
        marker.setRadius(
          isTerminal ? STOP_RADIUS.terminal : STOP_RADIUS.normal,
        );
    });
    return marker;
  }

  // Flechas <> a lo largo del trazado que muestran hacia dónde avanza la
  // ruta. En trazados largos se muestra una de cada dos para no saturar.
  buildDirectionArrows(orderedPoints, color) {
    const step = orderedPoints.length > 10 ? 2 : 1;
    const markers = [];

    for (let i = 0; i < orderedPoints.length - 1; i += step) {
      const a = orderedPoints[i];
      const b = orderedPoints[i + 1];
      const mid = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
      const angle = bearingDegrees(a, b);

      const marker = L.marker([mid.lat, mid.lng], {
        icon: buildArrowIcon(color, angle),
        interactive: true,
        keyboard: false,
      });
      markers.push(marker);
    }
    return markers;
  }

  // --- Lista lateral -----------------------------------------------------

  renderList() {
    if (!this.listContainer) return;
    this.listContainer.innerHTML = "";

    this.routes.forEach((route, index) => {
      const entry = this.lines.get(route.groupId);
      const hasLine = !!entry;
      const color = this.colorFor(index);
      const stopCount = Array.isArray(route.points)
        ? route.points.filter((p) => !p.skipStop).length
        : 0;
      const isFavorite = this.favoriteIds.has(route.groupId);

      // Nota: ya no es un solo <button> — un botón de "seleccionar" y el
      // botón de estrella van como hermanos, no anidados (un <button>
      // dentro de otro <button> es HTML inválido y rompe el click de la
      // estrella).
      const wrapper = document.createElement("div");
      wrapper.dataset.groupId = route.groupId;
      wrapper.className = [
        "route-list-item flex items-center gap-1 rounded-lg border transition-all",
        hasLine
          ? "border-gray-200 hover:bg-gray-50 hover:border-gray-300"
          : "border-gray-100 opacity-50",
      ].join(" ");

      wrapper.innerHTML = `
        <button
          type="button"
          ${hasLine ? "" : "disabled"}
          class="route-select-btn flex-1 min-w-0 flex items-center gap-3 px-3 py-2.5 text-left ${hasLine ? "cursor-pointer" : "cursor-not-allowed"}"
        >
          <span
            class="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-xs ring-2 ring-white shadow"
            style="background:${color}"
          >${escapeHtml(shortLabel(route.routeNumber))}</span>
          <span class="flex-1 min-w-0">
            <span class="block font-semibold text-ar-oxford truncate">Ruta ${escapeHtml(String(route.routeNumber))}</span>
            <span class="flex items-center gap-1.5 text-xs text-ar-oxford-disabled truncate">
              ${route.name ? `<span class="truncate">${escapeHtml(route.name)}</span><span>&middot;</span>` : ""}
              <span class="whitespace-nowrap">${stopCount} parada${stopCount === 1 ? "" : "s"}</span>
            </span>
          </span>
          ${route.farePrice != null ? `<span class="shrink-0 text-xs font-semibold text-ar-oxford-disabled">$${route.farePrice}</span>` : ""}
        </button>
        <span class="shrink-0 pr-2">${renderFavoriteStarHtml(route.groupId, isFavorite)}</span>
      `;

      if (hasLine) {
        wrapper
          .querySelector(".route-select-btn")
          .addEventListener("click", () => this.selectRoute(route.groupId));
      }
      this.listContainer.appendChild(wrapper);
    });
  }

  // --- Interacción: hover / selección --------------------------------------

  // Adelanto sutil al pasar el mouse por la línea (solo si nada está
  // seleccionado todavía), para que la ruta "responda" al cursor.
  previewHover(groupId, isHovering) {
    if (this.selectedId) return;
    const entry = this.lines.get(groupId);
    if (!entry) return;
    entry.polyline.setStyle({
      weight: isHovering ? WEIGHT.selected : WEIGHT.normal,
    });
  }

  selectRoute(groupId) {
    if (this.selectedId === groupId) {
      this.clearSelection();
      return;
    }
    this.selectedId = groupId;

    this.lines.forEach(({ polyline, stopMarkers, arrowMarkers }, id) => {
      const isSelected = id === groupId;
      const opacity = isSelected ? OPACITY.selected : OPACITY.dimmed;
      const weight = isSelected ? WEIGHT.selected : WEIGHT.dimmed;

      polyline.setStyle({ opacity, weight });
      if (isSelected) polyline.bringToFront();

      stopMarkers.forEach((marker) => {
        marker.options._dimmed = !isSelected;
        marker.setStyle({ opacity, fillOpacity: opacity });
        if (isSelected) marker.bringToFront(); // <-- evita que la línea los tape
      });
      arrowMarkers.forEach((marker) => marker.setOpacity(opacity));
    });

    this.updateListSelection();
  }

  clearSelection() {
    this.selectedId = null;
    this.lines.forEach(({ polyline, stopMarkers, arrowMarkers }) => {
      polyline.setStyle({ opacity: OPACITY.normal, weight: WEIGHT.normal });
      stopMarkers.forEach((marker) => {
        marker.options._dimmed = false;
        marker.setStyle({
          opacity: OPACITY.normal,
          fillOpacity: OPACITY.normal,
        });
      });
      arrowMarkers.forEach((marker) => marker.setOpacity(OPACITY.normal));
    });
    this.updateListSelection();
  }

  updateListSelection() {
    this.listContainer?.querySelectorAll(".route-list-item").forEach((el) => {
      const isSelected = el.dataset.groupId === this.selectedId;
      const isDimmed = this.selectedId && !isSelected;
      el.classList.toggle("bg-ar-cerulean-disabled", isSelected);
      el.classList.toggle("border-ar-cerulean", isSelected);
      el.classList.toggle("opacity-50", isDimmed);
    });
  }
}

// --- Helpers ---------------------------------------------------------------

// Rumbo (0-360°, 0 = norte, sentido horario) entre dos puntos lat/lng.
// Suficiente para un mapa a escala de ciudad; no requiere proyección exacta.
function bearingDegrees(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return (deg + 360) % 360;
}

// Ícono de flecha (chevron) apuntando al norte por defecto, rotado según
// el rumbo del tramo. El contorno blanco asegura contraste sobre cualquier
// color de línea o de mapa base.
function buildArrowIcon(color, angleDeg) {
  return L.divIcon({
    className: "",
    html: `<div style="width:16px;height:16px;transform:rotate(${angleDeg}deg);transform-origin:50% 50%;filter:drop-shadow(0 1px 1px rgba(0,0,0,.35))">
      <svg width="16" height="16" viewBox="0 0 24 24">
        <path d="M12 3 L19.5 19 L12 14.5 L4.5 19 Z" fill="${color}" stroke="#ffffff" stroke-width="1.4" stroke-linejoin="round" />
      </svg>
    </div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

// Recorta el número/etiqueta de ruta para que quepa dentro del badge
// circular de la lista (igual que los círculos numerados de un mapa de metro).
function shortLabel(routeNumber) {
  const str = String(routeNumber ?? "");
  return str.length > 3 ? str.slice(0, 3) : str;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
