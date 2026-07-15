import pool from "./db.js";

/**
 * Devuelve, para cada grupo de ruta publicado (is_active = TRUE), la
 * plantilla que debe mostrarse al público en este momento: la activa si
 * existe (por ejemplo un desvío vigente), o si no la default.
 *
 * Este es el único punto de lectura que usa el buscador público de rutas
 * (`/buscar-ruta`), separado de los endpoints /api/route-groups/* que
 * son solo para el panel de administración (requieren rol ADMIN).
 */
export async function listActiveRoutesForFinder() {
  const [rows] = await pool.query(
    `SELECT g.id AS group_id,
            g.route_number,
            g.name,
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
    templateId: row.route_template_id,
    label: row.label,
    isLoop: !!row.is_loop,
    farePrice: row.fare_price,
    points:
      typeof row.points === "string" ? JSON.parse(row.points) : row.points,
  }));
}
