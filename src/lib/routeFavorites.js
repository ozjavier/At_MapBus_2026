import { randomUUID } from "node:crypto";
import pool from "./db.js";

/**
 * Favoritos de un usuario, con los datos necesarios para pintar el
 * thumbnail esquemático en /perfil/favoritos (points de la plantilla
 * activa, o la default si no hay ninguna activa distinta).
 */
export async function listFavoritesByUser(userId) {
  const [rows] = await pool.query(
    `SELECT f.id AS favorite_id, f.route_group_id, f.notify_changes, f.created_at,
            g.route_number, g.name, g.is_manually_locked, g.manual_lock_reason,
            t.points, t.is_loop, t.fare_price
     FROM route_favorites f
     JOIN route_groups g ON g.id = f.route_group_id
     JOIN route_templates t ON t.id = COALESCE(g.active_route_id, g.default_route_id)
     WHERE f.user_id = ?
     ORDER BY f.created_at DESC`,
    [userId],
  );

  return rows.map((row) => ({
    favoriteId: row.favorite_id,
    routeGroupId: row.route_group_id,
    notifyChanges: !!row.notify_changes,
    isManuallyLocked: !!row.is_manually_locked,
    manualLockReason: row.manual_lock_reason,
    createdAt: row.created_at,
    routeNumber: row.route_number,
    name: row.name,
    isLoop: !!row.is_loop,
    farePrice: row.fare_price,
    points:
      typeof row.points === "string" ? JSON.parse(row.points) : row.points,
  }));
}

/**
 * Solo los IDs de route_group favoritos del usuario. Usado en
 * /buscar-ruta y /ruta para pintar el estado inicial de las estrellas
 * del lado servidor, sin traer todo el payload de listFavoritesByUser.
 */
export async function getFavoriteRouteIdsForUser(userId) {
  if (!userId) return [];
  const [rows] = await pool.query(
    `SELECT route_group_id FROM route_favorites WHERE user_id = ?`,
    [userId],
  );
  return rows.map((r) => r.route_group_id);
}

export async function addFavorite(userId, routeGroupId, notifyChanges = false) {
  const [groupRows] = await pool.query(
    `SELECT id FROM route_groups WHERE id = ? LIMIT 1`,
    [routeGroupId],
  );
  if (groupRows.length === 0) {
    throw new Error("ROUTE_GROUP_NOT_FOUND");
  }

  // Si ya existía (usuario le da doble-click a la estrella, o reintenta),
  // solo actualiza notify_changes en vez de fallar por la UNIQUE.
  await pool.query(
    `INSERT INTO route_favorites (id, user_id, route_group_id, notify_changes)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE notify_changes = VALUES(notify_changes)`,
    [randomUUID(), userId, routeGroupId, notifyChanges],
  );
}

export async function removeFavorite(userId, routeGroupId) {
  await pool.query(
    `DELETE FROM route_favorites WHERE user_id = ? AND route_group_id = ?`,
    [userId, routeGroupId],
  );
}

export async function updateNotifyPreference(
  userId,
  routeGroupId,
  notifyChanges,
) {
  const [result] = await pool.query(
    `UPDATE route_favorites SET notify_changes = ? WHERE user_id = ? AND route_group_id = ?`,
    [notifyChanges, userId, routeGroupId],
  );
  if (result.affectedRows === 0) {
    throw new Error("FAVORITE_NOT_FOUND");
  }
}
