import { z } from 'zod';
import { requireApiRole, jsonResponse, jsonError } from '../../../../../lib/apiHelpers.js';
import { checkOverlap } from '../../../../../lib/scheduleRules.js';

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

const draftSchema = z.object({
  daysOfWeek: z.array(z.number().int().min(0).max(6)).nullable().optional(),
  startTime: z.string().regex(timeRegex),
  endTime: z.string().regex(timeRegex).nullable().optional(),
  priority: z.number().int().min(0),
  excludeRuleId: z.string().uuid().optional(),
});

export async function POST(context) {
  const guard = requireApiRole(context, 'ADMIN');
  if (guard) return guard;

  const body = await context.request.json().catch(() => null);
  const parsed = draftSchema.safeParse(body);
  if (!parsed.success) return jsonError('Datos invalidos', 400, parsed.error.flatten().fieldErrors);

  const { excludeRuleId, ...draft } = parsed.data;
  const conflicts = await checkOverlap(context.params.id, draft, excludeRuleId);
  return jsonResponse({ conflicts }); // arreglo vacio = sin solapes
}
