import pool from "./db.js";

export async function listNotifications(userId, { limit = 30 } = {}) {
  const [rows] = await pool.query(
    `SELECT * FROM user_notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
    [userId, limit],
  );
  return rows.map(mapRow);
}

export async function countUnread(userId) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count FROM user_notifications WHERE user_id = ? AND is_read = FALSE`,
    [userId],
  );
  return rows[0]?.count ?? 0;
}

export async function markAsRead(userId, id) {
  await pool.query(
    `UPDATE user_notifications SET is_read = TRUE WHERE id = ? AND user_id = ?`,
    [id, userId],
  );
}

export async function markAllAsRead(userId) {
  await pool.query(
    `UPDATE user_notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE`,
    [userId],
  );
}

function mapRow(row) {
  return {
    id: row.id,
    routeGroupId: row.route_group_id,
    type: row.type,
    title: row.title,
    message: row.message,
    isRead: !!row.is_read,
    createdAt: row.created_at,
  };
}
