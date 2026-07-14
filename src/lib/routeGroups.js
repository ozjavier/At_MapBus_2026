import { randomUUID } from 'node:crypto';
import pool from './db.js';

// --- Lectura ---

export async function listGroups() {
  const [rows] = await pool.query(
    `SELECT g.*,
            dt.label AS default_template_label,
            at.label AS active_template_label
     FROM route_groups g
     LEFT JOIN route_templates dt ON dt.id = g.default_route_id
     LEFT JOIN route_templates at ON at.id = g.active_route_id
     ORDER BY g.route_number ASC`
  );
  return rows;
}

export async function getGroupById(id) {
  const [rows] = await pool.query(`SELECT * FROM route_groups WHERE id = ? LIMIT 1`, [id]);
  return rows[0] ?? null;
}

// --- Escritura basica ---

export async function createGroup({ routeNumber, name, description, transportType }) {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO route_groups (id, route_number, name, description, transport_type)
     VALUES (?, ?, ?, ?, ?)`,
    [id, routeNumber, name ?? null, description ?? null, transportType ?? null]
  );
  return id;
}

export async function updateGroup(id, { name, description, transportType, isActive }) {
  await pool.query(
    `UPDATE route_groups SET name = ?, description = ?, transport_type = ?, is_active = ? WHERE id = ?`,
    [name ?? null, description ?? null, transportType ?? null, isActive ?? true, id]
  );
}

export async function deleteGroup(id) {
  // ON DELETE CASCADE ya limpia plantillas, reglas y logs asociados.
  await pool.query(`DELETE FROM route_groups WHERE id = ?`, [id]);
}

export async function setDefaultTemplate(groupId, routeTemplateId) {
  const [rows] = await pool.query(
    `SELECT id FROM route_templates WHERE id = ? AND group_id = ? LIMIT 1`,
    [routeTemplateId, groupId]
  );
  if (rows.length === 0) throw new Error('La plantilla no pertenece a este grupo');

  await pool.query(`UPDATE route_groups SET default_route_id = ? WHERE id = ?`, [routeTemplateId, groupId]);
}

// --- Cambio de plantilla activa, con auditoria (unico punto de entrada) ---

export async function setActiveTemplate(groupId, targetRouteId, { triggeredBy, ruleId = null, reason = null, performedByUserId = null }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [groupRows] = await conn.query(`SELECT * FROM route_groups WHERE id = ? FOR UPDATE`, [groupId]);
    const group = groupRows[0];
    if (!group) throw new Error('Grupo de ruta no encontrado');

    if (group.active_route_id === targetRouteId) {
      await conn.commit();
      return group; // no-op, ya estaba activa
    }

    const [templateRows] = await conn.query(
      `SELECT id FROM route_templates WHERE id = ? AND group_id = ? LIMIT 1`,
      [targetRouteId, groupId]
    );
    if (templateRows.length === 0) throw new Error('La plantilla no pertenece a este grupo');

    await conn.query(`UPDATE route_groups SET active_route_id = ? WHERE id = ?`, [targetRouteId, groupId]);

    await conn.query(
      `INSERT INTO route_activation_logs
         (id, group_id, new_route_id, previous_route_id, triggered_by, rule_id, reason, performed_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), groupId, targetRouteId, group.active_route_id, triggeredBy, ruleId, reason, performedByUserId]
    );

    await conn.commit();
    return { ...group, active_route_id: targetRouteId };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function revertToDefault(groupId, { reason, userId } = {}) {
  const group = await getGroupById(groupId);
  if (!group?.default_route_id) throw new Error('Este grupo no tiene plantilla default definida');

  return setActiveTemplate(groupId, group.default_route_id, {
    triggeredBy: 'MANUAL_UNLOCK',
    reason: reason || 'Reversion manual a plantilla default',
    performedByUserId: userId,
  });
}

// --- Candado manual (emergencias sin horario de fin conocido) ---

export async function lockManual(groupId, { routeTemplateId, reason, userId }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [groupRows] = await conn.query(`SELECT * FROM route_groups WHERE id = ? FOR UPDATE`, [groupId]);
    const group = groupRows[0];
    if (!group) throw new Error('Grupo de ruta no encontrado');

    await conn.query(
      `UPDATE route_groups
       SET is_manually_locked = TRUE, manual_lock_reason = ?, manual_locked_at = NOW(),
           manual_locked_by_user_id = ?, active_route_id = ?
       WHERE id = ?`,
      [reason ?? null, userId ?? null, routeTemplateId, groupId]
    );

    await conn.query(
      `INSERT INTO route_activation_logs
         (id, group_id, new_route_id, previous_route_id, triggered_by, reason, performed_by_user_id)
       VALUES (?, ?, ?, ?, 'MANUAL_LOCK', ?, ?)`,
      [randomUUID(), groupId, routeTemplateId, group.active_route_id, reason ?? null, userId ?? null]
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function unlockAndRevertToDefault(groupId, { reason, userId } = {}) {
  const group = await getGroupById(groupId);
  if (!group) throw new Error('Grupo de ruta no encontrado');
  if (!group.default_route_id) throw new Error('Grupo sin plantilla default');

  await pool.query(
    `UPDATE route_groups
     SET is_manually_locked = FALSE, manual_lock_reason = NULL, manual_locked_at = NULL, manual_locked_by_user_id = NULL
     WHERE id = ?`,
    [groupId]
  );

  return setActiveTemplate(groupId, group.default_route_id, {
    triggeredBy: 'MANUAL_UNLOCK',
    reason: reason || 'Candado liberado, reversion a default',
    performedByUserId: userId,
  });
}

// --- Auditoria ---

export async function getActivationLog(groupId, { limit = 50 } = {}) {
  const [rows] = await pool.query(
    `SELECT l.*, nr.label AS new_route_label, pr.label AS previous_route_label
     FROM route_activation_logs l
     LEFT JOIN route_templates nr ON nr.id = l.new_route_id
     LEFT JOIN route_templates pr ON pr.id = l.previous_route_id
     WHERE l.group_id = ?
     ORDER BY l.occurred_at DESC
     LIMIT ?`,
    [groupId, limit]
  );
  return rows;
}

// Log informativo de solape entre reglas, sin cambiar la plantilla activa.
export async function logConflictWarning(groupId, { newRouteId, ruleId, reason }) {
  const group = await getGroupById(groupId);
  await pool.query(
    `INSERT INTO route_activation_logs (id, group_id, new_route_id, previous_route_id, triggered_by, rule_id, reason)
     VALUES (?, ?, ?, ?, 'SCHEDULE_CONFLICT_WARNING', ?, ?)`,
    [randomUUID(), groupId, newRouteId, group?.active_route_id ?? null, ruleId, reason]
  );
}

// Usado por el scheduler: todos los grupos activos con sus reglas, en un solo viaje.
export async function listActiveGroupsWithRules() {
  const [groups] = await pool.query(`SELECT * FROM route_groups WHERE is_active = TRUE`);
  if (groups.length === 0) return [];

  const [rules] = await pool.query(
    `SELECT * FROM route_schedule_rules WHERE is_enabled = TRUE AND group_id IN (?)`,
    [groups.map((g) => g.id)]
  );

  return groups.map((group) => ({
    ...group,
    scheduleRules: rules.filter((r) => r.group_id === group.id),
  }));
}
