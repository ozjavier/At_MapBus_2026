import { z } from "zod";
import {
  requireApiRole,
  jsonResponse,
  jsonError,
} from "../../../../../lib/apiHelpers.js";
import { getGroupById } from "../../../../../lib/routeGroups.js";
import {
  listTemplates,
  createTemplate,
  duplicateTemplate,
} from "../../../../../lib/routeTemplates.js";

const pointSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  skipStop: z.boolean().optional(),
  manualSegment: z.boolean().optional(),
});

const createTemplateSchema = z.object({
  label: z.string().min(1),
  reason: z.string().optional(),
  points: z.array(pointSchema).min(2),
  description: z.string().optional(),
  isLoop: z.boolean().optional().default(false),
  farePrice: z.number().nullable().optional(),
  scheduleStart: z.string().nullable().optional(),
  scheduleEnd: z.string().nullable().optional(),
  frequency: z.number().int().nullable().optional(),
});

const duplicateSchema = z.object({
  sourceRouteId: z.string().uuid(),
  label: z.string().optional(),
  reason: z.string().optional(),
});

export async function GET(context) {
  const guard = requireApiRole(context, "ADMIN");
  if (guard) return guard;

  const group = await getGroupById(context.params.id);
  if (!group) return jsonError("Grupo no encontrado", 404);

  const templates = await listTemplates(context.params.id);
  return jsonResponse(templates);
}

// Con `sourceRouteId` en el body => duplica una plantilla existente.
// Sin el => crea la primera plantilla ("Default") de un grupo nuevo.
export async function POST(context) {
  const guard = requireApiRole(context, "ADMIN");
  if (guard) return guard;

  const group = await getGroupById(context.params.id);
  if (!group) return jsonError("Grupo no encontrado", 404);

  const body = await context.request.json().catch(() => null);

  if (body?.sourceRouteId) {
    const parsed = duplicateSchema.safeParse(body);
    if (!parsed.success)
      return jsonError(
        "Datos invalidos",
        400,
        parsed.error.flatten().fieldErrors,
      );

    const newId = await duplicateTemplate(
      parsed.data.sourceRouteId,
      parsed.data,
    );
    return jsonResponse({ id: newId }, 201);
  }

  const parsed = createTemplateSchema.safeParse(body);
  if (!parsed.success)
    return jsonError(
      "Datos invalidos",
      400,
      parsed.error.flatten().fieldErrors,
    );

  const newId = await createTemplate(context.params.id, parsed.data);
  return jsonResponse({ id: newId }, 201);
}
