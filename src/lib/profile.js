import { randomUUID } from 'node:crypto';
import pool from './db.js';
import { hashPassword, verifyPassword } from './auth.js';

/**
 * Datos completos de perfil para la sección "Mi Cuenta".
 * Separado de getUserFromSessionId (auth.js) porque ese solo trae lo
 * mínimo para el middleware; aquí sí conviene un roundtrip completo.
 */
export async function getProfileById(userId) {
  const [rows] = await pool.query(
    `SELECT u.id, u.email, r.name AS role,
            p.first_name, p.last_name
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN user_profiles p ON p.user_id = u.id
     WHERE u.id = ?
     LIMIT 1`,
    [userId]
  );
  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    role: row.role,
    firstName: row.first_name ?? '',
    lastName: row.last_name ?? '',
  };
}

/**
 * Actualiza nombre/apellido y, opcionalmente, el correo.
 * El cambio de correo no reenvía verificación todavía (queda anotado
 * como pendiente); si se agrega, este es el lugar donde enganchar el
 * envío del correo de confirmación antes de aplicar el cambio.
 */
export async function updateProfile(userId, { firstName, lastName, email }) {
  await pool.query(
    `UPDATE user_profiles SET first_name = ?, last_name = ? WHERE user_id = ?`,
    [firstName || null, lastName || null, userId]
  );

  if (email) {
    await pool.query(`UPDATE users SET email = ? WHERE id = ?`, [email, userId]);
  }

  return getProfileById(userId);
}

export async function changeUserPassword(userId, currentPassword, newPassword) {
  const [rows] = await pool.query(
    `SELECT password_hash FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  const user = rows[0];
  if (!user) {
    throw new Error('Usuario no encontrado');
  }

  const validPassword = await verifyPassword(currentPassword, user.password_hash);
  if (!validPassword) {
    throw new Error('CURRENT_PASSWORD_INVALID');
  }

  const newHash = await hashPassword(newPassword);
  await pool.query(`UPDATE users SET password_hash = ? WHERE id = ?`, [newHash, userId]);
}

const DEFAULT_NOTIFICATION_PREFERENCES = {
  systemBrowser: true,
  systemEmail: false,
  planBrowser: true,
  planEmail: true,
  routeChangesBrowser: true,
  routeChangesEmail: true,
  marketingBrowser: false,
  marketingEmail: false,
};

function mapPreferencesRow(row) {
  return {
    systemBrowser: !!row.system_browser,
    systemEmail: !!row.system_email,
    planBrowser: !!row.plan_browser,
    planEmail: !!row.plan_email,
    routeChangesBrowser: !!row.route_changes_browser,
    routeChangesEmail: !!row.route_changes_email,
    marketingBrowser: !!row.marketing_browser,
    marketingEmail: !!row.marketing_email,
  };
}

/**
 * Trae las preferencias de notificaciones del usuario. Si nunca las ha
 * configurado, crea la fila con los valores por defecto para que la
 * UI siempre tenga algo consistente que mostrar.
 */
export async function getNotificationPreferences(userId) {
  const [rows] = await pool.query(
    `SELECT * FROM notification_preferences WHERE user_id = ? LIMIT 1`,
    [userId]
  );

  if (rows[0]) {
    return mapPreferencesRow(rows[0]);
  }

  await pool.query(
    `INSERT INTO notification_preferences (
       id, user_id,
       system_browser, system_email,
       plan_browser, plan_email,
       route_changes_browser, route_changes_email,
       marketing_browser, marketing_email
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      userId,
      DEFAULT_NOTIFICATION_PREFERENCES.systemBrowser,
      DEFAULT_NOTIFICATION_PREFERENCES.systemEmail,
      DEFAULT_NOTIFICATION_PREFERENCES.planBrowser,
      DEFAULT_NOTIFICATION_PREFERENCES.planEmail,
      DEFAULT_NOTIFICATION_PREFERENCES.routeChangesBrowser,
      DEFAULT_NOTIFICATION_PREFERENCES.routeChangesEmail,
      DEFAULT_NOTIFICATION_PREFERENCES.marketingBrowser,
      DEFAULT_NOTIFICATION_PREFERENCES.marketingEmail,
    ]
  );

  return { ...DEFAULT_NOTIFICATION_PREFERENCES };
}

export async function updateNotificationPreferences(userId, prefs) {
  // Aseguramos que la fila exista antes de actualizar.
  await getNotificationPreferences(userId);

  await pool.query(
    `UPDATE notification_preferences SET
       system_browser = ?, system_email = ?,
       plan_browser = ?, plan_email = ?,
       route_changes_browser = ?, route_changes_email = ?,
       marketing_browser = ?, marketing_email = ?
     WHERE user_id = ?`,
    [
      !!prefs.systemBrowser,
      !!prefs.systemEmail,
      !!prefs.planBrowser,
      !!prefs.planEmail,
      !!prefs.routeChangesBrowser,
      !!prefs.routeChangesEmail,
      !!prefs.marketingBrowser,
      !!prefs.marketingEmail,
      userId,
    ]
  );

  return getNotificationPreferences(userId);
}
