import { randomBytes, randomUUID, createHash } from "node:crypto";
import pool from "./db.js";
import { hashPassword } from "./auth.js";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hora

function hashToken(rawToken) {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Genera un token de recuperación para el usuario indicado. Invalida
 * cualquier token sin usar que ya tuviera pendiente, para que solo el
 * enlace más reciente enviado por correo sea válido.
 * Devuelve el token en texto plano (el único momento en que existe sin
 * hashear) para incluirlo en el correo; en la base solo se guarda su hash.
 */
export async function createPasswordResetToken(userId) {
  const rawToken = randomBytes(32).toString("hex"); // 64 chars hex
  const tokenHash = hashToken(rawToken); // sha256 hex -> 64 chars, coincide con CHAR(64)
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await pool.query(
    `DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL`,
    [userId],
  );

  await pool.query(
    `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`,
    [randomUUID(), userId, tokenHash, expiresAt],
  );

  return rawToken;
}

/**
 * Busca un token válido (no usado y no expirado) a partir del valor en
 * texto plano recibido por query string o por el body del POST.
 * Devuelve { id, userId } o null si no es válido por cualquier motivo.
 */
export async function findValidResetToken(rawToken) {
  if (!rawToken) return null;
  const tokenHash = hashToken(rawToken);

  const [rows] = await pool.query(
    `SELECT id, user_id, expires_at
     FROM password_reset_tokens
     WHERE token_hash = ? AND used_at IS NULL
     LIMIT 1`,
    [tokenHash],
  );

  const row = rows[0];
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) return null;

  return { id: row.id, userId: row.user_id };
}

/**
 * Aplica la nueva contraseña, marca el token como usado y cierra
 * cualquier sesión activa del usuario (por seguridad — si alguien más
 * tenía acceso con la contraseña anterior, queda fuera).
 */
export async function resetPasswordWithToken(rawToken, newPassword) {
  const tokenData = await findValidResetToken(rawToken);
  if (!tokenData) {
    throw new Error("TOKEN_INVALID");
  }

  const newHash = await hashPassword(newPassword);

  await pool.query(`UPDATE users SET password_hash = ? WHERE id = ?`, [
    newHash,
    tokenData.userId,
  ]);
  await pool.query(
    `UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?`,
    [tokenData.id],
  );
  await pool.query(`DELETE FROM sessions WHERE user_id = ?`, [
    tokenData.userId,
  ]);
}
