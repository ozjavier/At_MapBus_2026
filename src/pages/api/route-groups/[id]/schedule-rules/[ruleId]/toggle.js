import { z } from 'zod';
import { requireApiRole, jsonResponse, jsonError } from '../../../../../../lib/apiHelpers.js';
import { getRuleById, toggleRule } from '../../../../../../lib/scheduleRules.js';

const toggleSchema = z.object({ isEnabled: z.boolean() });

export async function PATCH(context) {
  const guard = requireApiRole(context, 'ADMIN');
  if (guard) return guard;

  const rule = await getRuleById(context.params.ruleId);
  if (!rule || rule.group_id !== context.params.id) return jsonError('Regla no encontrada', 404);

  const body = await context.request.json().catch(() => null);
  const parsed = toggleSchema.safeParse(body);
  if (!parsed.success) return jsonError('Datos invalidos', 400, parsed.error.flatten().fieldErrors);

  await toggleRule(context.params.ruleId, parsed.data.isEnabled);
  return jsonResponse({ ok: true });
}
