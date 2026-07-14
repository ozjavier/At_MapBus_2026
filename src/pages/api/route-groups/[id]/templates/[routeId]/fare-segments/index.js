import { z } from 'zod';
import { requireApiRole, jsonResponse, jsonError } from '../../../../../../lib/apiHelpers.js';
import { getTemplateById } from '../../../../../../lib/routeTemplates.js';
import { listFareSegments, createFareSegment } from '../../../../../../lib/fareSegments.js';

const segmentSchema = z.object({
  fareTypeId: z.string().uuid(),
  startPointIndex: z.number().int().min(0),
  endPointIndex: z.number().int().min(0),
  farePrice: z.number().min(0),
  description: z.string().optional(),
});

function belongsToGroup(template, groupId) {
  return template && template.group_id === groupId;
}

export async function GET(context) {
  const guard = requireApiRole(context, 'ADMIN');
  if (guard) return guard;

  const template = await getTemplateById(context.params.routeId);
  if (!belongsToGroup(template, context.params.id)) return jsonError('Plantilla no encontrada', 404);

  const segments = await listFareSegments(context.params.routeId);
  return jsonResponse(segments);
}

export async function POST(context) {
  const guard = requireApiRole(context, 'ADMIN');
  if (guard) return guard;

  const template = await getTemplateById(context.params.routeId);
  if (!belongsToGroup(template, context.params.id)) return jsonError('Plantilla no encontrada', 404);

  const body = await context.request.json().catch(() => null);
  const parsed = segmentSchema.safeParse(body);
  if (!parsed.success) return jsonError('Datos invalidos', 400, parsed.error.flatten().fieldErrors);

  if (parsed.data.endPointIndex <= parsed.data.startPointIndex) {
    return jsonError('El punto final debe ser mayor al punto inicial');
  }

  try {
    const id = await createFareSegment(context.params.routeId, parsed.data);
    return jsonResponse({ id }, 201);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return jsonError('Ya existe un precio para ese tramo y tipo de tarifa', 409);
    throw err;
  }
}
