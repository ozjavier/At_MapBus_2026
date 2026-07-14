import { randomUUID } from 'node:crypto';
import pool from './db.js';

export async function listFareSegments(routeTemplateId) {
  const [rows] = await pool.query(
    `SELECT fs.*, ft.code AS fare_type_code, ft.label AS fare_type_label
     FROM fare_segments fs
     JOIN fare_types ft ON ft.id = fs.fare_type_id
     WHERE fs.route_template_id = ?
     ORDER BY fs.start_point_index ASC, ft.sort_order ASC`,
    [routeTemplateId]
  );
  return rows;
}

export async function getFareSegmentById(id) {
  const [rows] = await pool.query(`SELECT * FROM fare_segments WHERE id = ? LIMIT 1`, [id]);
  return rows[0] ?? null;
}

export async function createFareSegment(routeTemplateId, data) {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO fare_segments (id, route_template_id, fare_type_id, start_point_index, end_point_index, fare_price, description)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, routeTemplateId, data.fareTypeId, data.startPointIndex, data.endPointIndex, data.farePrice, data.description ?? null]
  );
  return id;
}

export async function updateFareSegment(id, data) {
  await pool.query(
    `UPDATE fare_segments
     SET fare_type_id = ?, start_point_index = ?, end_point_index = ?, fare_price = ?, description = ?
     WHERE id = ?`,
    [data.fareTypeId, data.startPointIndex, data.endPointIndex, data.farePrice, data.description ?? null, id]
  );
}

export async function deleteFareSegment(id) {
  await pool.query(`DELETE FROM fare_segments WHERE id = ?`, [id]);
}
