import pool from "./db.js";

/**
 * Devuelve, para cada grupo de ruta publicado (is_active = TRUE), la
 * plantilla que debe mostrarse al público en este momento: la activa si
 * existe (por ejemplo un desvío vigente), o si no la default.
 *
 * Este es el único punto de lectura que usa el buscador público de rutas
 * (`/buscar-ruta`), separado de los endpoints /api/route-groups/* que
 * son solo para el panel de administración (requieren rol ADMIN).
 *
 * Incluye isManuallyLocked/manualLockReason para que el buscador pueda
 * avisar cuando la recomendación corresponde a un desvío de emergencia.
 * Deliberadamente NO se incluye manual_locked_by_user_id: ese dato es
 * solo para el panel de admin.
 */
export async function listActiveRoutesForFinder() {
  const [rows] = await pool.query(
    `SELECT g.id AS group_id,
            g.route_number,
            g.name,
            g.is_manually_locked,
            g.manual_lock_reason,
            t.id AS route_template_id,
            t.label,
            t.points,
            t.is_loop,
            t.fare_price
     FROM route_groups g
     JOIN route_templates t ON t.id = COALESCE(g.active_route_id, g.default_route_id)
     WHERE g.is_active = TRUE
     ORDER BY g.route_number ASC`,
  );

  return rows.map((row) => ({
    groupId: row.group_id,
    routeNumber: row.route_number,
    name: row.name,
    isManuallyLocked: !!row.is_manually_locked,
    manualLockReason: row.manual_lock_reason,
    templateId: row.route_template_id,
    label: row.label,
    isLoop: !!row.is_loop,
    farePrice: row.fare_price,
    points:
      typeof row.points === "string" ? JSON.parse(row.points) : row.points,
  }));
}

// Puntos de rutas específicas (por route_group id), para pintarlas en el
// mapa de "Rutas relacionadas" de un artículo del blog.
export async function getRoutesWithPointsByIds(groupIds) {
  if (!groupIds || groupIds.length === 0) return [];

  const [rows] = await pool.query(
    `SELECT g.id AS group_id,
            g.route_number,
            g.name,
            t.points,
            t.is_loop
     FROM route_groups g
     JOIN route_templates t ON t.id = COALESCE(g.active_route_id, g.default_route_id)
     WHERE g.id IN (?)
     ORDER BY g.route_number ASC`,
    [groupIds],
  );

  return rows.map((row) => ({
    groupId: row.group_id,
    routeNumber: row.route_number,
    name: row.name,
    isLoop: !!row.is_loop,
    points:
      typeof row.points === "string" ? JSON.parse(row.points) : row.points,
  }));
}

/**
 * Lista de todos los grupos con un candado de emergencia activo ahora
 * mismo. Pensado para un banner global (ej. en BaseLayout) o para el
 * resumen de alertas en /rutas — no requiere sesión, es dato público.
 */
export async function getServiceAlerts() {
  const [rows] = await pool.query(
    `SELECT id AS group_id, route_number, name, manual_lock_reason, manual_locked_at
     FROM route_groups
     WHERE is_active = TRUE AND is_manually_locked = TRUE
     ORDER BY manual_locked_at DESC`,
  );

  return rows.map((row) => ({
    groupId: row.group_id,
    routeNumber: row.route_number,
    name: row.name,
    reason: row.manual_lock_reason,
    lockedAt: row.manual_locked_at,
  }));
}
