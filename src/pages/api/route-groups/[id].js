import { z } from 'zod';
import { requireApiRole, jsonResponse, jsonError } from '../../../lib/apiHelpers.js';
import { getGroupById, updateGroup, deleteGroup } from '../../../lib/routeGroups.js';

const updateGroupSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  transportType: z.string().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(context) {
  const guard = requireApiRole(context, 'ADMIN');
  if (guard) return guard;

  const group = await getGroupById(context.params.id);
  if (!group) return jsonError('Grupo no encontrado', 404);
  return jsonResponse(group);
}

export async function PUT(context) {
  const guard = requireApiRole(context, 'ADMIN');
  if (guard) return guard;

  const existing = await getGroupById(context.params.id);
  if (!existing) return jsonError('Grupo no encontrado', 404);

  const body = await context.request.json().catch(() => null);
  const parsed = updateGroupSchema.safeParse(body);
  if (!parsed.success) return jsonError('Datos invalidos', 400, parsed.error.flatten().fieldErrors);

  await updateGroup(context.params.id, {
    name: parsed.data.name ?? existing.name,
    description: parsed.data.description ?? existing.description,
    transportType: parsed.data.transportType ?? existing.transport_type,
    isActive: parsed.data.isActive ?? Boolean(existing.is_active),
  });
  return jsonResponse({ ok: true });
}

export async function DELETE(context) {
  const guard = requireApiRole(context, 'ADMIN');
  if (guard) return guard;

  const existing = await getGroupById(context.params.id);
  if (!existing) return jsonError('Grupo no encontrado', 404);

  await deleteGroup(context.params.id);
  return jsonResponse({ ok: true });
}
