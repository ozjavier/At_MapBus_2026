import { z } from 'zod';
import { requireApiRole, jsonResponse, jsonError } from '../../../../lib/apiHelpers.js';
import { unlockAndRevertToDefault } from '../../../../lib/routeGroups.js';

const revertSchema = z.object({ reason: z.string().optional() });

export async function POST(context) {
  const guard = requireApiRole(context, 'ADMIN');
  if (guard) return guard;

  const body = await context.request.json().catch(() => ({}));
  const parsed = revertSchema.safeParse(body);
  const reason = parsed.success ? parsed.data.reason : undefined;

  try {
    await unlockAndRevertToDefault(context.params.id, { reason, userId: context.locals.user.id });
    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonError(err.message, 400);
  }
}
