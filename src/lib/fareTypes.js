import { randomUUID } from 'node:crypto';
import pool from './db.js';

export async function listFareTypes({ onlyActive = true } = {}) {
  const [rows] = await pool.query(
    `SELECT * FROM fare_types ${onlyActive ? 'WHERE is_active = TRUE' : ''} ORDER BY sort_order ASC, label ASC`
  );
  return rows;
}

export async function createFareType({ code, label, sortOrder }) {
  const id = randomUUID();
  await pool.query(`INSERT INTO fare_types (id, code, label, sort_order) VALUES (?, ?, ?, ?)`, [
    id,
    code,
    label,
    sortOrder ?? 0,
  ]);
  return id;
}
