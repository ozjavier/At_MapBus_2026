import { z } from 'zod';
import { requireApiRole, jsonResponse, jsonError } from '../../../lib/apiHelpers.js';
import { listGroups, createGroup } from '../../../lib/routeGroups.js';

const createGroupSchema = z.object({
  routeNumber: z.string().min(1),
  name: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  transportType: z.string().optional(),
});

export async function GET(context) {
  const guard = requireApiRole(context, 'ADMIN');
  if (guard) return guard;

  const groups = await listGroups();
  return jsonResponse(groups);
}

export async function POST(context) {
  const guard = requireApiRole(context, 'ADMIN');
  if (guard) return guard;

  const body = await context.request.json().catch(() => null);
  const parsed = createGroupSchema.safeParse(body);
  if (!parsed.success) return jsonError('Datos invalidos', 400, parsed.error.flatten().fieldErrors);

  const id = await createGroup(parsed.data);
  return jsonResponse({ id }, 201);
}
