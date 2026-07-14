import { z } from 'zod';
import { requireApiRole, jsonResponse, jsonError } from '../../../../../../lib/apiHelpers.js';
import { getTemplateById } from '../../../../../../lib/routeTemplates.js';
import { listOperatingSchedules, createOperatingSchedule } from '../../../../../../lib/operatingSchedules.js';

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

const scheduleSchema = z
  .object({
    scheduleType: z.enum(['WEEKDAY', 'SPECIFIC_DATE']),
    label: z.string().optional(),
    dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
    specificDate: z.string().nullable().optional(),
    startTime: z.string().regex(timeRegex, 'Formato esperado HH:MM'),
    endTime: z.string().regex(timeRegex, 'Formato esperado HH:MM'),
    frequency: z.number().int().min(1),
    isActive: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.scheduleType === 'WEEKDAY'
        ? data.dayOfWeek !== null && data.dayOfWeek !== undefined
        : Boolean(data.specificDate),
    { message: 'Falta el dia de la semana o la fecha especifica segun el tipo de bloque' }
  );

function belongsToGroup(template, groupId) {
  return template && template.group_id === groupId;
}

export async function GET(context) {
  const guard = requireApiRole(context, 'ADMIN');
  if (guard) return guard;

  const template = await getTemplateById(context.params.routeId);
  if (!belongsToGroup(template, context.params.id)) return jsonError('Plantilla no encontrada', 404);

  const schedules = await listOperatingSchedules(context.params.routeId);
  return jsonResponse(schedules);
}

export async function POST(context) {
  const guard = requireApiRole(context, 'ADMIN');
  if (guard) return guard;

  const template = await getTemplateById(context.params.routeId);
  if (!belongsToGroup(template, context.params.id)) return jsonError('Plantilla no encontrada', 404);

  const body = await context.request.json().catch(() => null);
  const parsed = scheduleSchema.safeParse(body);
  if (!parsed.success) return jsonError('Datos invalidos', 400, parsed.error.flatten().fieldErrors);

  if (parsed.data.endTime <= parsed.data.startTime) {
    return jsonError('La hora de fin debe ser posterior a la de inicio');
  }

  const id = await createOperatingSchedule(context.params.routeId, parsed.data);
  return jsonResponse({ id }, 201);
}
