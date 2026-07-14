import { randomUUID } from 'node:crypto';
import pool from './db.js';

function parseTemplateRow(row) {
  if (!row) return row;
  return { ...row, points: JSON.parse(row.points) };
}

export async function listTemplates(groupId, { includeArchived = false } = {}) {
  const [rows] = await pool.query(
    `SELECT * FROM route_templates WHERE group_id = ? ${includeArchived ? '' : 'AND is_archived = FALSE'} ORDER BY created_at ASC`,
    [groupId]
  );
  return rows.map(parseTemplateRow);
}

export async function getTemplateById(id) {
  const [rows] = await pool.query(`SELECT * FROM route_templates WHERE id = ? LIMIT 1`, [id]);
  return parseTemplateRow(rows[0] ?? null);
}

export async function getTemplateWithDetails(id) {
  const template = await getTemplateById(id);
  if (!template) return null;

  const [fareSegments] = await pool.query(
    `SELECT * FROM fare_segments WHERE route_template_id = ? ORDER BY start_point_index ASC`,
    [id]
  );
  const [schedules] = await pool.query(`SELECT * FROM operating_schedules WHERE route_template_id = ?`, [id]);

  return { ...template, fareSegments, schedules };
}

export async function createTemplate(groupId, data) {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO route_templates
       (id, group_id, label, reason, points, description, fare_price, schedule_start, schedule_end, frequency)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      groupId,
      data.label,
      data.reason ?? null,
      JSON.stringify(data.points),
      data.description ?? null,
      data.farePrice ?? null,
      data.scheduleStart ?? null,
      data.scheduleEnd ?? null,
      data.frequency ?? null,
    ]
  );
  return id;
}

export async function updateTemplate(id, data) {
  await pool.query(
    `UPDATE route_templates
     SET label = ?, reason = ?, points = ?, description = ?, fare_price = ?, schedule_start = ?, schedule_end = ?, frequency = ?
     WHERE id = ?`,
    [
      data.label,
      data.reason ?? null,
      JSON.stringify(data.points),
      data.description ?? null,
      data.farePrice ?? null,
      data.scheduleStart ?? null,
      data.scheduleEnd ?? null,
      data.frequency ?? null,
      id,
    ]
  );
}

/**
 * Duplica una plantilla completa (puntos, segmentos de tarifa y horarios de
 * operacion) dentro del mismo grupo. Nunca se toca la plantilla en vivo:
 * se clona y se trabaja/edita sobre la copia.
 */
export async function duplicateTemplate(sourceRouteId, { label, reason }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [sourceRows] = await conn.query(`SELECT * FROM route_templates WHERE id = ? LIMIT 1`, [sourceRouteId]);
    const source = sourceRows[0];
    if (!source) throw new Error('Plantilla de origen no encontrada');

    const newId = randomUUID();
    await conn.query(
      `INSERT INTO route_templates
         (id, group_id, label, reason, points, description, fare_price, schedule_start, schedule_end, frequency)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId,
        source.group_id,
        label || `${source.label} (copia)`,
        reason ?? null,
        source.points,
        source.description,
        source.fare_price,
        source.schedule_start,
        source.schedule_end,
        source.frequency,
      ]
    );

    const [fareSegments] = await conn.query(`SELECT * FROM fare_segments WHERE route_template_id = ?`, [sourceRouteId]);
    for (const seg of fareSegments) {
      await conn.query(
        `INSERT INTO fare_segments (id, route_template_id, fare_type_id, start_point_index, end_point_index, fare_price, description)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [randomUUID(), newId, seg.fare_type_id, seg.start_point_index, seg.end_point_index, seg.fare_price, seg.description]
      );
    }

    const [schedules] = await conn.query(`SELECT * FROM operating_schedules WHERE route_template_id = ?`, [sourceRouteId]);
    for (const sch of schedules) {
      await conn.query(
        `INSERT INTO operating_schedules
           (id, route_template_id, schedule_type, day_of_week, specific_date, start_time, end_time, frequency, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [randomUUID(), newId, sch.schedule_type, sch.day_of_week, sch.specific_date, sch.start_time, sch.end_time, sch.frequency, sch.is_active]
      );
    }

    await conn.commit();
    return newId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Si la plantilla ya aparece en el historial de activacion, se archiva en
 * vez de borrarse (no perder trazabilidad de emergencias pasadas).
 */
export async function archiveOrDeleteTemplate(id) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count FROM route_activation_logs WHERE new_route_id = ? OR previous_route_id = ?`,
    [id, id]
  );

  if (rows[0].count > 0) {
    await pool.query(`UPDATE route_templates SET is_archived = TRUE WHERE id = ?`, [id]);
    return 'archived';
  }

  await pool.query(`DELETE FROM route_templates WHERE id = ?`, [id]);
  return 'deleted';
}
