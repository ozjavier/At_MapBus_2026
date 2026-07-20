// Módulo compartido para el ícono de estrella de "favorito" que aparece
// en /rutas (mapa esquemático) y en /buscar-ruta (resultados de búsqueda).
// Usa delegación de eventos sobre document, así que funciona sin importar
// si los botones se generan en el render inicial o después (por ejemplo,
// routesOverviewMap.js reconstruye la lista dinámicamente).
//
// Requisito de integración: cada botón de estrella debe tener
//   data-favorite-star
//   data-group-id="<route_group_id>"
// y renderizarse con renderFavoriteStarHtml() para que clases y estado
// inicial (favorito o no) queden consistentes.

const STAR_FILLED = `<svg viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path d="M9.05 2.93a1 1 0 011.9 0l1.64 3.4 3.76.5a1 1 0 01.55 1.7l-2.72 2.65.64 3.74a1 1 0 01-1.45 1.05L10 14.98l-3.37 1.99a1 1 0 01-1.45-1.05l.64-3.74L3.1 8.53a1 1 0 01.55-1.7l3.76-.5 1.64-3.4z"/></svg>`;
const STAR_OUTLINE = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="w-5 h-5"><path d="M9.05 2.93a1 1 0 011.9 0l1.64 3.4 3.76.5a1 1 0 01.55 1.7l-2.72 2.65.64 3.74a1 1 0 01-1.45 1.05L10 14.98l-3.37 1.99a1 1 0 01-1.45-1.05l.64-3.74L3.1 8.53a1 1 0 01.55-1.7l3.76-.5 1.64-3.4z"/></svg>`;

let initialized = false;
let isLoggedIn = false;
let loginRedirectPath = "/";
let openPopoverEl = null;

export function renderFavoriteStarHtml(groupId, isFavorite) {
  return `<button
    type="button"
    data-favorite-star
    data-group-id="${groupId}"
    data-favorite="${isFavorite ? "true" : "false"}"
    title="${isFavorite ? "Quitar de favoritos" : "Guardar como favorita"}"
    class="favorite-star-btn shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full hover:bg-ar-cerulean-disabled/40 transition-colors ${isFavorite ? "text-ar-saffron" : "text-ar-oxford-disabled"}"
  >${isFavorite ? STAR_FILLED : STAR_OUTLINE}</button>`;
}

export function initFavoriteStars(options = {}) {
  if (initialized) return;
  initialized = true;

  isLoggedIn = !!options.isLoggedIn;
  loginRedirectPath = options.loginRedirectPath || window.location.pathname;

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-favorite-star]");
    if (btn) {
      e.stopPropagation();
      handleStarClick(btn);
      return;
    }
    if (openPopoverEl && !e.target.closest(".favorite-popover")) {
      closePopover();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && openPopoverEl) closePopover();
  });
}

function handleStarClick(btn) {
  if (!isLoggedIn) {
    showLoginToast();
    return;
  }

  const groupId = btn.dataset.groupId;
  const wasFavorite = btn.dataset.favorite === "true";

  if (wasFavorite) {
    setStarState(btn, false);
    closePopover();
    fetch(`/api/favorites/${groupId}`, { method: "DELETE" }).catch((err) => {
      console.error("[favorites] No se pudo quitar el favorito:", err);
      setStarState(btn, true);
    });
    return;
  }

  setStarState(btn, true);
  fetch("/api/favorites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ routeGroupId: groupId, notifyChanges: false }),
  })
    .then((res) => {
      if (!res.ok) throw new Error("request failed");
      openPopover(btn, groupId);
    })
    .catch((err) => {
      console.error("[favorites] No se pudo guardar el favorito:", err);
      setStarState(btn, false);
    });
}

function setStarState(btn, isFavorite) {
  btn.dataset.favorite = isFavorite ? "true" : "false";
  btn.title = isFavorite ? "Quitar de favoritos" : "Guardar como favorita";
  btn.classList.toggle("text-ar-saffron", isFavorite);
  btn.classList.toggle("text-ar-oxford-disabled", !isFavorite);
  btn.innerHTML = isFavorite ? STAR_FILLED : STAR_OUTLINE;
}

function closePopover() {
  openPopoverEl?.remove();
  openPopoverEl = null;
}

function openPopover(anchorBtn, groupId) {
  closePopover();

  const rect = anchorBtn.getBoundingClientRect();
  const popover = document.createElement("div");
  popover.className =
    "favorite-popover fixed z-50 w-64 bg-white rounded-lg shadow-lg border border-gray-200 p-3 text-sm";
  popover.style.top = `${rect.bottom + window.scrollY + 6}px`;
  popover.style.left = `${Math.max(8, rect.right + window.scrollX - 256)}px`;

  popover.innerHTML = `
    <p class="font-semibold text-ar-oxford mb-2">★ Ruta guardada en favoritos</p>
    <label class="flex items-start gap-2 cursor-pointer">
      <input type="checkbox" data-notify-checkbox class="mt-0.5" />
      <span class="text-ar-oxford-disabled">Avisarme si esta ruta cambia</span>
    </label>
    <button type="button" data-popover-done class="mt-3 w-full bg-ar-cerulean text-white rounded-md py-1.5 font-semibold hover:bg-ar-cerulean-hover transition-colors">
      Listo
    </button>
  `;

  document.body.appendChild(popover);
  openPopoverEl = popover;

  const checkbox = popover.querySelector("[data-notify-checkbox]");
  checkbox.addEventListener("change", () => {
    fetch(`/api/favorites/${groupId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notifyChanges: checkbox.checked }),
    }).catch((err) => {
      console.error("[favorites] No se pudo actualizar el aviso:", err);
      checkbox.checked = !checkbox.checked;
    });
  });

  popover
    .querySelector("[data-popover-done]")
    .addEventListener("click", closePopover);
}

function showLoginToast() {
  document.getElementById("favorite-login-toast")?.remove();

  const toast = document.createElement("div");
  toast.id = "favorite-login-toast";
  toast.className =
    "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-ar-oxford text-white rounded-lg shadow-lg px-4 py-3 text-sm flex items-center gap-3";
  toast.innerHTML = `
    <span>Inicia sesión para guardar rutas favoritas</span>
    <a href="/login?redirect=${encodeURIComponent(loginRedirectPath)}" class="font-semibold underline whitespace-nowrap">Iniciar sesión</a>
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}
