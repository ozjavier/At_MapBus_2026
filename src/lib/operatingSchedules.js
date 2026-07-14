import { randomUUID } from 'node:crypto';
import pool from './db.js';

export async function listOperatingSchedules(routeTemplateId) {
  const [rows] = await pool.query(
    `SELECT * FROM operating_schedules
     WHERE route_template_id = ?
     ORDER BY day_of_week ASC, specific_date ASC, start_time ASC`,
    [routeTemplateId]
  );
  return rows;
}

export async function getOperatingScheduleById(id) {
  const [rows] = await pool.query(`SELECT * FROM operating_schedules WHERE id = ? LIMIT 1`, [id]);
  return rows[0] ?? null;
}

export async function createOperatingSchedule(routeTemplateId, data) {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO operating_schedules
       (id, route_template_id, schedule_type, label, day_of_week, specific_date, start_time, end_time, frequency, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      routeTemplateId,
      data.scheduleType,
      data.label ?? null,
      data.dayOfWeek ?? null,
      data.specificDate ?? null,
      data.startTime,
      data.endTime,
      data.frequency,
      data.isActive ?? true,
    ]
  );
  return id;
}

export async function updateOperatingSchedule(id, data) {
  await pool.query(
    `UPDATE operating_schedules
     SET schedule_type = ?, label = ?, day_of_week = ?, specific_date = ?, start_time = ?, end_time = ?, frequency = ?, is_active = ?
     WHERE id = ?`,
    [
      data.scheduleType,
      data.label ?? null,
      data.dayOfWeek ?? null,
      data.specificDate ?? null,
      data.startTime,
      data.endTime,
      data.frequency,
      data.isActive ?? true,
      id,
    ]
  );
}

export async function deleteOperatingSchedule(id) {
  await pool.query(`DELETE FROM operating_schedules WHERE id = ?`, [id]);
}
