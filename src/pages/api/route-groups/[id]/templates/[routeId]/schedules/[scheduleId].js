import { z } from 'zod';
import { requireApiRole, jsonResponse, jsonError } from '../../../../../../lib/apiHelpers.js';
import { getOperatingScheduleById, updateOperatingSchedule, deleteOperatingSchedule } from '../../../../../../lib/operatingSchedules.js';

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

const scheduleSchema = z.object({
  scheduleType: z.enum(['WEEKDAY', 'SPECIFIC_DATE']),
  label: z.string().optional(),
  dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  specificDate: z.string().nullable().optional(),
  startTime: z.string().regex(timeRegex),
  endTime: z.string().regex(timeRegex),
  frequency: z.number().int().min(1),
  isActive: z.boolean().optional(),
});

function belongsToTemplate(schedule, routeId) {
  return schedule && schedule.route_template_id === routeId;
}

export async function PUT(context) {
  const guard = requireApiRole(context, 'ADMIN');
  if (guard) return guard;

  const schedule = await getOperatingScheduleById(context.params.scheduleId);
  if (!belongsToTemplate(schedule, context.params.routeId)) return jsonError('Horario no encontrado', 404);

  const body = await context.request.json().catch(() => null);
  const parsed = scheduleSchema.safeParse(body);
  if (!parsed.success) return jsonError('Datos invalidos', 400, parsed.error.flatten().fieldErrors);

  await updateOperatingSchedule(context.params.scheduleId, parsed.data);
  return jsonResponse({ ok: true });
}

export async function DELETE(context) {
  const guard = requireApiRole(context, 'ADMIN');
  if (guard) return guard;

  const schedule = await getOperatingScheduleById(context.params.scheduleId);
  if (!belongsToTemplate(schedule, context.params.routeId)) return jsonError('Horario no encontrado', 404);

  await deleteOperatingSchedule(context.params.scheduleId);
  return jsonResponse({ ok: true });
}
