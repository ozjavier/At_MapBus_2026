const POLL_INTERVAL_MS = 60000;

export function initNotificationBell({
  buttonEl,
  panelEl,
  listEl,
  badgeEl,
  markAllBtn,
}) {
  if (!buttonEl || !panelEl || !listEl) return;

  let isOpen = false;
  let notifications = [];

  async function fetchNotifications() {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json();
      notifications = data.notifications ?? [];
      renderBadge(data.unreadCount ?? 0);
      if (isOpen) renderList();
    } catch (err) {
      console.error(
        "[notificationBell] No se pudieron cargar notificaciones:",
        err,
      );
    }
  }

  function renderBadge(unreadCount) {
    if (!badgeEl) return;
    if (unreadCount > 0) {
      badgeEl.textContent = unreadCount > 9 ? "9+" : String(unreadCount);
      badgeEl.classList.remove("hidden");
    } else {
      badgeEl.classList.add("hidden");
    }
  }

  function renderList() {
    if (notifications.length === 0) {
      listEl.innerHTML = `<p class="text-sm text-ar-oxford-disabled p-4 text-center">No tienes notificaciones</p>`;
      return;
    }

    listEl.innerHTML = notifications
      .map(
        (n) => `
        <button type="button" data-id="${n.id}" class="notification-item cursor-pointer w-full text-left px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors ${n.isRead ? "" : "bg-ar-cerulean-disabled/30"}">
          <p class="text-sm font-semibold text-ar-oxford">${escapeHtml(n.title)}</p>
          <p class="text-xs text-ar-oxford-disabled mt-0.5">${escapeHtml(n.message)}</p>
          <p class="text-[11px] text-ar-oxford-disabled mt-1">${formatRelativeTime(n.createdAt)}</p>
        </button>`,
      )
      .join("");
  }

  function togglePanel(forceState) {
    isOpen = typeof forceState === "boolean" ? forceState : !isOpen;
    panelEl.classList.toggle("hidden", !isOpen);
    if (isOpen) renderList();
  }

  buttonEl.addEventListener("click", (e) => {
    e.stopPropagation();
    togglePanel();
  });

  document.addEventListener("click", (e) => {
    if (isOpen && !panelEl.contains(e.target) && e.target !== buttonEl) {
      togglePanel(false);
    }
  });

  // Delegación de eventos: la lista se re-renderiza completa en cada
  // fetch, así que un solo listener en el contenedor sobrevive a eso.
  listEl.addEventListener("click", async (e) => {
    const item = e.target.closest(".notification-item");
    if (!item) return;
    const id = item.dataset.id;
    item.classList.remove("bg-ar-cerulean-disabled/30");

    try {
      await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
      const notif = notifications.find((n) => n.id === id);
      if (notif) notif.isRead = true;
      renderBadge(notifications.filter((n) => !n.isRead).length);
    } catch (err) {
      console.error("[notificationBell] No se pudo marcar como leída:", err);
    }
  });

  markAllBtn?.addEventListener("click", async () => {
    try {
      await fetch("/api/notifications/read-all", { method: "PATCH" });
      notifications.forEach((n) => (n.isRead = true));
      renderList();
      renderBadge(0);
    } catch (err) {
      console.error(
        "[notificationBell] No se pudieron marcar todas como leídas:",
        err,
      );
    }
  });

  fetchNotifications();
  setInterval(fetchNotifications, POLL_INTERVAL_MS);
}

function formatRelativeTime(dateStr) {
  const date = new Date(dateStr);
  const diffMin = Math.round((Date.now() - date.getTime()) / 60000);
  if (diffMin < 1) return "justo ahora";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffHrs = Math.round(diffMin / 60);
  if (diffHrs < 24) return `hace ${diffHrs} h`;
  return `hace ${Math.round(diffHrs / 24)} d`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
