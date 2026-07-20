import { randomUUID } from "node:crypto";
import pool from "./db.js";
import { getNotificationPreferences } from "./profile.js";
import { sendRouteChangeEmail } from "./mailer.js";

const TITLES_BY_TRIGGER = {
  MANUAL_LOCK: "Desvío de emergencia activo",
  MANUAL_UNLOCK: "La ruta volvió a su recorrido normal",
  SCHEDULE_RULE: "Cambio programado de recorrido",
};

function buildMessage({ routeNumber, routeName, reason, triggeredBy }) {
  const label = `Ruta ${routeNumber}${routeName ? ` — ${routeName}` : ""}`;

  switch (triggeredBy) {
    case "MANUAL_LOCK":
      return `${label} tiene un desvío de emergencia activo${reason ? `: ${reason}` : "."}`;
    case "MANUAL_UNLOCK":
      return `${label} volvió a su recorrido habitual.`;
    default:
      return `${label} cambió de recorrido${reason ? `: ${reason}` : "."}`;
  }
}

/**
 * Punto único de notificación a favoritos. Se llama desde routeGroups.js
 * justo después de que un cambio de plantilla activa quedó confirmado en
 * la base de datos (nunca antes del commit).
 *
 * No lanza errores hacia arriba: una falla aquí no debe tumbar el cambio
 * de ruta que ya se aplicó correctamente, solo se registra en consola.
 */
export async function notifyFavoritesOfRouteChange({
  groupId,
  triggeredBy,
  reason = null,
}) {
  try {
    const [groupRows] = await pool.query(
      `SELECT route_number, name FROM route_groups WHERE id = ? LIMIT 1`,
      [groupId],
    );
    const group = groupRows[0];
    if (!group) return;

    const [favoriteRows] = await pool.query(
      `SELECT f.user_id, u.email
       FROM route_favorites f
       JOIN users u ON u.id = f.user_id
       WHERE f.route_group_id = ? AND f.notify_changes = TRUE`,
      [groupId],
    );
    if (favoriteRows.length === 0) return;

    const title = TITLES_BY_TRIGGER[triggeredBy] || "Actualización de ruta";
    const message = buildMessage({
      routeNumber: group.route_number,
      routeName: group.name,
      reason,
      triggeredBy,
    });

    for (const fav of favoriteRows) {
      // El toggle por favorito ya filtró en el WHERE de arriba; aquí solo
      // revisamos la preferencia global de /perfil/notificaciones por canal.
      const prefs = await getNotificationPreferences(fav.user_id);

      if (prefs.routeChangesBrowser) {
        await pool.query(
          `INSERT INTO user_notifications (id, user_id, route_group_id, type, title, message)
           VALUES (?, ?, ?, 'SERVICE_ALERT', ?, ?)`,
          [randomUUID(), fav.user_id, groupId, title, message],
        );
      }

      if (prefs.routeChangesEmail) {
        try {
          await sendRouteChangeEmail(fav.email, {
            title,
            message,
            routeNumber: group.route_number,
          });
        } catch (emailErr) {
          // Un correo individual fallido no debe frenar el resto de la lista.
          console.error(
            `[routeChangeNotifications] No se pudo enviar correo a ${fav.email}:`,
            emailErr,
          );
        }
      }
    }
  } catch (err) {
    console.error(
      "[routeChangeNotifications] No se pudo notificar a favoritos:",
      err,
    );
  }
}
