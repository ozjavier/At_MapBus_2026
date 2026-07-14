import { z } from "zod";
import {
  requireApiRole,
  jsonResponse,
  jsonError,
} from "../../../../../lib/apiHelpers.js";
import {
  getTemplateWithDetails,
  updateTemplate,
  archiveOrDeleteTemplate,
} from "../../../../../lib/routeTemplates.js";

const pointSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  skipStop: z.boolean().optional(),
  manualSegment: z.boolean().optional(),
});

const updateTemplateSchema = z.object({
  label: z.string().min(1),
  reason: z.string().optional(),
  points: z.array(pointSchema).min(2),
  description: z.string().optional(),
  farePrice: z.number().nullable().optional(),
  scheduleStart: z.string().nullable().optional(),
  scheduleEnd: z.string().nullable().optional(),
  isLoop: z.boolean().optional().default(false),
  frequency: z.number().int().nullable().optional(),
});

function belongsToGroup(template, groupId) {
  return template && template.group_id === groupId;
}

export async function GET(context) {
  const guard = requireApiRole(context, "ADMIN");
  if (guard) return guard;

  const template = await getTemplateWithDetails(context.params.routeId);
  if (!belongsToGroup(template, context.params.id))
    return jsonError("Plantilla no encontrada", 404);

  return jsonResponse(template);
}

export async function PUT(context) {
  const guard = requireApiRole(context, "ADMIN");
  if (guard) return guard;

  const template = await getTemplateWithDetails(context.params.routeId);
  if (!belongsToGroup(template, context.params.id))
    return jsonError("Plantilla no encontrada", 404);

  const body = await context.request.json().catch(() => null);
  const parsed = updateTemplateSchema.safeParse(body);
  if (!parsed.success)
    return jsonError(
      "Datos invalidos",
      400,
      parsed.error.flatten().fieldErrors,
    );

  await updateTemplate(context.params.routeId, parsed.data);
  return jsonResponse({ ok: true });
}

export async function DELETE(context) {
  const guard = requireApiRole(context, "ADMIN");
  if (guard) return guard;

  const template = await getTemplateWithDetails(context.params.routeId);
  if (!belongsToGroup(template, context.params.id))
    return jsonError("Plantilla no encontrada", 404);

  const result = await archiveOrDeleteTemplate(context.params.routeId);
  return jsonResponse({ ok: true, result }); // "archived" o "deleted"
}
