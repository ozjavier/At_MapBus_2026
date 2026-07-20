// Renderizador de la grilla de /perfil/favoritos. No usa Leaflet — el
// thumbnail es un SVG estático calculado a partir de los `points`
// guardados, normalizados a un viewBox fijo. Evita cargar Leaflet en una
// página que no necesita mapas interactivos.

const LINE_COLORS = [
  "#e0201f",
  "#00833e",
  "#f75e91",
  "#f2d219",
  "#0072bb",
  "#f47a20",
  "#754c29",
  "#a4ce4e",
  "#8f9296",
  "#00a99d",
  "#7b2e8d",
  "#b79a2c",
  "#d4145a",
  "#0f9b8e",
  "#c1272d",
];

// Mismo color por ruta cada vez que se renderiza (no depende del orden
// de llegada de la lista, a diferencia de /rutas donde el color viene
// del índice de iteración).
function colorForGroupId(groupId) {
  let hash = 0;
  for (let i = 0; i < groupId.length; i++) {
    hash = (hash * 31 + groupId.charCodeAt(i)) >>> 0;
  }
  return LINE_COLORS[hash % LINE_COLORS.length];
}

function buildThumbnailSvg(points, color, isLoop) {
  if (!Array.isArray(points) || points.length < 2) {
    return `<svg viewBox="0 0 200 120" class="w-full h-full"><text x="100" y="64" text-anchor="middle" font-size="11" fill="#9CA3AF">Sin trazado</text></svg>`;
  }

  const ordered = isLoop ? [...points, points[0]] : points;
  const lats = ordered.map((p) => p.lat);
  const lngs = ordered.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const width = 200;
  const height = 120;
  const padding = 14;
  const latRange = maxLat - minLat || 0.0001;
  const lngRange = maxLng - minLng || 0.0001;

  // La Y de pantalla crece hacia abajo, pero la latitud crece hacia el
  // norte (arriba) — por eso se invierte al proyectar.
  const project = (p) => {
    const x = padding + ((p.lng - minLng) / lngRange) * (width - padding * 2);
    const y =
      padding + (1 - (p.lat - minLat) / latRange) * (height - padding * 2);
    return [x, y];
  };

  const pathD = ordered
    .map(project)
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");

  const boardablePoints = points.filter((p) => !p.skipStop);
  const stopCircles = boardablePoints
    .map((p, i) => {
      const [x, y] = project(p);
      const isTerminal = i === 0 && !isLoop;
      return isTerminal
        ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="white" stroke="${color}" stroke-width="2"/>`
        : `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5" fill="${color}" stroke="white" stroke-width="1"/>`;
    })
    .join("");

  return `<svg viewBox="0 0 ${width} ${height}" class="w-full h-full">
    <path d="${pathD}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    ${stopCircles}
  </svg>`;
}

export function renderFavoritesGrid({
  favorites,
  gridContainer,
  emptyContainer,
}) {
  if (!gridContainer) return;

  if (!favorites || favorites.length === 0) {
    emptyContainer?.classList.remove("hidden");
    return;
  }

  gridContainer.innerHTML = favorites
    .map((fav) => {
      const color = colorForGroupId(fav.routeGroupId);
      const thumbnail = buildThumbnailSvg(fav.points, color, fav.isLoop);

      return `
      <div class="favorite-card bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm" data-group-id="${fav.routeGroupId}">
        <a href="/rutas?highlight=${fav.routeGroupId}" class="block bg-gray-50 h-32 flex items-center justify-center hover:bg-gray-100 transition-colors">
          ${thumbnail}
        </a>
        <div class="p-3">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="font-semibold text-ar-oxford truncate">Ruta ${escapeHtml(String(fav.routeNumber))}</p>
              ${fav.name ? `<p class="text-xs text-ar-oxford-disabled truncate">${escapeHtml(fav.name)}</p>` : ""}
            </div>
            <button type="button" data-remove-btn title="Quitar de favoritos" class="cursor-pointer shrink-0 text-ar-oxford-disabled hover:text-ar-folly transition-colors">
              ✕
            </button>
          </div>
          <label class="flex items-start gap-2 mt-3 text-xs text-ar-oxford-disabled cursor-pointer">
            <input type="checkbox" data-notify-checkbox ${fav.notifyChanges ? "checked" : ""} class="mt-0.5" />
            <span>Avisarme si esta ruta cambia</span>
          </label>
          <a href="/rutas?highlight=${fav.routeGroupId}" class="block mt-3 text-center text-xs font-semibold text-ar-cerulean hover:underline">
            Ver en el mapa
          </a>
        </div>
      </div>`;
    })
    .join("");

  wireCardEvents(gridContainer, emptyContainer);
}

function wireCardEvents(gridContainer, emptyContainer) {
  gridContainer.querySelectorAll(".favorite-card").forEach((card) => {
    const groupId = card.dataset.groupId;

    const checkbox = card.querySelector("[data-notify-checkbox]");
    checkbox?.addEventListener("change", () => {
      fetch(`/api/favorites/${groupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notifyChanges: checkbox.checked }),
      }).catch((err) => {
        console.error("[favorites] No se pudo actualizar el aviso:", err);
        checkbox.checked = !checkbox.checked;
      });
    });

    const removeBtn = card.querySelector("[data-remove-btn]");
    removeBtn?.addEventListener("click", () => {
      if (!confirm("¿Quitar esta ruta de tus favoritos?")) return;
      card.style.opacity = "0.4";
      fetch(`/api/favorites/${groupId}`, { method: "DELETE" })
        .then((res) => {
          if (!res.ok) throw new Error("request failed");
          card.remove();
          if (!gridContainer.querySelector(".favorite-card")) {
            emptyContainer?.classList.remove("hidden");
          }
        })
        .catch((err) => {
          console.error("[favorites] No se pudo quitar el favorito:", err);
          card.style.opacity = "1";
        });
    });
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
