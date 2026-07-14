import { z } from 'zod';
import { requireApiRole, jsonResponse, jsonError } from '../../../../../lib/apiHelpers.js';
import { getRuleById, updateRule, deleteRule } from '../../../../../lib/scheduleRules.js';

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

const updateRuleSchema = z.object({
  targetRouteId: z.string().uuid(),
  name: z.string().optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  startTime: z.string().regex(timeRegex),
  endTime: z.string().regex(timeRegex).nullable().optional(),
  priority: z.number().int().min(0),
  isEnabled: z.boolean().optional(),
});

function belongsToGroup(rule, groupId) {
  return rule && rule.group_id === groupId;
}

export async function PUT(context) {
  const guard = requireApiRole(context, 'ADMIN');
  if (guard) return guard;

  const rule = await getRuleById(context.params.ruleId);
  if (!belongsToGroup(rule, context.params.id)) return jsonError('Regla no encontrada', 404);

  const body = await context.request.json().catch(() => null);
  const parsed = updateRuleSchema.safeParse(body);
  if (!parsed.success) return jsonError('Datos invalidos', 400, parsed.error.flatten().fieldErrors);

  await updateRule(context.params.ruleId, parsed.data);
  return jsonResponse({ ok: true });
}

export async function DELETE(context) {
  const guard = requireApiRole(context, 'ADMIN');
  if (guard) return guard;

  const rule = await getRuleById(context.params.ruleId);
  if (!belongsToGroup(rule, context.params.id)) return jsonError('Regla no encontrada', 404);

  await deleteRule(context.params.ruleId);
  return jsonResponse({ ok: true });
}
