import { z } from 'zod';
import { requireApiRole, jsonResponse, jsonError } from '../../../../../lib/apiHelpers.js';
import { getGroupById } from '../../../../../lib/routeGroups.js';
import { listRules, createRule } from '../../../../../lib/scheduleRules.js';

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

const ruleSchema = z.object({
  targetRouteId: z.string().uuid(),
  name: z.string().optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  startTime: z.string().regex(timeRegex, 'Formato esperado HH:MM'),
  endTime: z.string().regex(timeRegex, 'Formato esperado HH:MM').nullable().optional(),
  priority: z.number().int().min(0).optional(),
});

export async function GET(context) {
  const guard = requireApiRole(context, 'ADMIN');
  if (guard) return guard;

  const group = await getGroupById(context.params.id);
  if (!group) return jsonError('Grupo no encontrado', 404);

  const rules = await listRules(context.params.id);
  return jsonResponse(rules);
}

export async function POST(context) {
  const guard = requireApiRole(context, 'ADMIN');
  if (guard) return guard;

  const group = await getGroupById(context.params.id);
  if (!group) return jsonError('Grupo no encontrado', 404);

  const body = await context.request.json().catch(() => null);
  const parsed = ruleSchema.safeParse(body);
  if (!parsed.success) return jsonError('Datos invalidos', 400, parsed.error.flatten().fieldErrors);

  const id = await createRule(context.params.id, parsed.data);
  return jsonResponse({ id }, 201);
}
