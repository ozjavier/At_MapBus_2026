import { z } from 'zod';
import { requireApiRole, jsonResponse, jsonError } from '../../../../../../lib/apiHelpers.js';
import { getFareSegmentById, updateFareSegment, deleteFareSegment } from '../../../../../../lib/fareSegments.js';

const segmentSchema = z.object({
  fareTypeId: z.string().uuid(),
  startPointIndex: z.number().int().min(0),
  endPointIndex: z.number().int().min(0),
  farePrice: z.number().min(0),
  description: z.string().optional(),
});

function belongsToTemplate(segment, routeId) {
  return segment && segment.route_template_id === routeId;
}

export async function PUT(context) {
  const guard = requireApiRole(context, 'ADMIN');
  if (guard) return guard;

  const segment = await getFareSegmentById(context.params.segmentId);
  if (!belongsToTemplate(segment, context.params.routeId)) return jsonError('Segmento no encontrado', 404);

  const body = await context.request.json().catch(() => null);
  const parsed = segmentSchema.safeParse(body);
  if (!parsed.success) return jsonError('Datos invalidos', 400, parsed.error.flatten().fieldErrors);

  try {
    await updateFareSegment(context.params.segmentId, parsed.data);
    return jsonResponse({ ok: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return jsonError('Ya existe un precio para ese tramo y tipo de tarifa', 409);
    throw err;
  }
}

export async function DELETE(context) {
  const guard = requireApiRole(context, 'ADMIN');
  if (guard) return guard;

  const segment = await getFareSegmentById(context.params.segmentId);
  if (!belongsToTemplate(segment, context.params.routeId)) return jsonError('Segmento no encontrado', 404);

  await deleteFareSegment(context.params.segmentId);
  return jsonResponse({ ok: true });
}
