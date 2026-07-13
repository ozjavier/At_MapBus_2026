import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import pool from './db.js';
import { SESSION_DURATION_MS } from './session.js';

const ROLE_ID_DEFAULT_USER = 2; // ver 01_schema_auth_roles_perfil.sql -> roles

export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export async function findUserByEmail(email) {
  const [rows] = await pool.query(
    `SELECT u.id, u.email, u.password_hash, u.is_active, r.name AS role
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.email = ?
     LIMIT 1`,
    [email]
  );
  return rows[0] ?? null;
}

export async function createUser({ email, password, name }) {
  const id = randomUUID();
  const passwordHash = await hashPassword(password);

  await pool.query(
    `INSERT INTO users (id, role_id, email, password_hash) VALUES (?, ?, ?, ?)`,
    [id, ROLE_ID_DEFAULT_USER, email, passwordHash]
  );

  await pool.query(
    `INSERT INTO user_profiles (user_id, first_name) VALUES (?, ?)`,
    [id, name ?? null]
  );

  return id;
}

export async function createSession(userId, meta = {}) {
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await pool.query(
    `INSERT INTO sessions (id, user_id, user_agent, ip_address, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
    [id, userId, meta.userAgent ?? null, meta.ip ?? null, expiresAt]
  );

  return { id, expiresAt };
}

export async function deleteSession(sessionId) {
  await pool.query(`DELETE FROM sessions WHERE id = ?`, [sessionId]);
}

// Usado por el middleware en cada request para resolver quién es el
// usuario a partir del valor de la cookie.
export async function getUserFromSessionId(sessionId) {
  const [rows] = await pool.query(
    `SELECT
        s.expires_at AS session_expires_at,
        u.id AS user_id,
        u.email,
        u.is_active,
        r.name AS role,
        p.first_name,
        p.last_name
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN user_profiles p ON p.user_id = u.id
     WHERE s.id = ?
     LIMIT 1`,
    [sessionId]
  );

  const row = rows[0];
  if (!row) return null;

  if (new Date(row.session_expires_at) < new Date() || !row.is_active) {
    await deleteSession(sessionId);
    return null;
  }

  return {
    id: row.user_id,
    email: row.email,
    role: row.role,
    name: [row.first_name, row.last_name].filter(Boolean).join(' ') || null,
  };
}

export async function touchLastLogin(userId) {
  await pool.query(`UPDATE users SET last_login_at = NOW() WHERE id = ?`, [userId]);
}
