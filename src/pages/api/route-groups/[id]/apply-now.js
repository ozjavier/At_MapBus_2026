import { z } from 'zod';
import { requireApiRole, jsonResponse, jsonError } from '../../../../lib/apiHelpers.js';
import { getGroupById, lockManual } from '../../../../lib/routeGroups.js';

const applyNowSchema = z.object({
  routeTemplateId: z.string().uuid(),
  reason: z.string().optional(),
});

export async function POST(context) {
  const guard = requireApiRole(context, 'ADMIN');
  if (guard) return guard;

  const group = await getGroupById(context.params.id);
  if (!group) return jsonError('Grupo no encontrado', 404);

  const body = await context.request.json().catch(() => null);
  const parsed = applyNowSchema.safeParse(body);
  if (!parsed.success) return jsonError('Datos invalidos', 400, parsed.error.flatten().fieldErrors);

  await lockManual(context.params.id, {
    routeTemplateId: parsed.data.routeTemplateId,
    reason: parsed.data.reason,
    userId: context.locals.user.id,
  });

  return jsonResponse({ ok: true });
}
