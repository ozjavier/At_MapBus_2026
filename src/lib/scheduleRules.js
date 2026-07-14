import { randomUUID } from 'node:crypto';
import pool from './db.js';

export async function listRules(groupId) {
  const [rows] = await pool.query(
    `SELECT * FROM route_schedule_rules WHERE group_id = ? ORDER BY priority DESC, start_time ASC`,
    [groupId]
  );
  return rows; // days_of_week ya llega parseado: es columna JSON, mysql2 la deserializa sola
}

export async function getRuleById(id) {
  const [rows] = await pool.query(`SELECT * FROM route_schedule_rules WHERE id = ? LIMIT 1`, [id]);
  return rows[0] ?? null;
}

export async function createRule(groupId, data) {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO route_schedule_rules
       (id, group_id, target_route_id, name, days_of_week, start_date, end_date, start_time, end_time, priority)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      groupId,
      data.targetRouteId,
      data.name ?? null,
      data.daysOfWeek ? JSON.stringify(data.daysOfWeek) : null,
      data.startDate ?? null,
      data.endDate ?? null,
      data.startTime,
      data.endTime ?? null,
      data.priority ?? 0,
    ]
  );
  return id;
}

export async function updateRule(id, data) {
  await pool.query(
    `UPDATE route_schedule_rules
     SET target_route_id = ?, name = ?, days_of_week = ?, start_date = ?, end_date = ?, start_time = ?, end_time = ?, priority = ?, is_enabled = ?
     WHERE id = ?`,
    [
      data.targetRouteId,
      data.name ?? null,
      data.daysOfWeek ? JSON.stringify(data.daysOfWeek) : null,
      data.startDate ?? null,
      data.endDate ?? null,
      data.startTime,
      data.endTime ?? null,
      data.priority ?? 0,
      data.isEnabled ?? true,
      id,
    ]
  );
}

export async function toggleRule(id, isEnabled) {
  await pool.query(`UPDATE route_schedule_rules SET is_enabled = ? WHERE id = ?`, [isEnabled, id]);
}

export async function deleteRule(id) {
  await pool.query(`DELETE FROM route_schedule_rules WHERE id = ?`, [id]);
}

/**
 * Aviso (no bloqueo) de solape con reglas de igual prioridad: vista previa
 * para la UI antes de guardar. El desempate real ocurre en el scheduler.
 */
export async function checkOverlap(groupId, draft, excludeRuleId = null) {
  const siblings = await listRules(groupId);
  const draftDays = draft.daysOfWeek ?? null;

  return siblings.filter((rule) => {
    if (excludeRuleId && rule.id === excludeRuleId) return false;
    if (!rule.is_enabled) return false;
    if (rule.priority !== draft.priority) return false;

    const ruleDays = rule.days_of_week ?? null;
    const daysOverlap = !draftDays || !ruleDays || draftDays.some((d) => ruleDays.includes(d));
    if (!daysOverlap) return false;

    return draft.startTime < (rule.end_time || '24:00') && rule.start_time < (draft.endTime || '24:00');
  });
}
