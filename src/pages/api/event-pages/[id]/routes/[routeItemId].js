import { z } from "zod";
import {
  requireApiRole,
  jsonResponse,
  jsonError,
} from "../../../../../lib/apiHelpers.js";
import {
  updateEventPageRoute,
  removeEventPageRoute,
} from "../../../../../lib/eventPages.js";

const updateRouteSchema = z.object({
  customInstructions: z.string().optional(),
  displayOrder: z.number().int(),
});

export async function PUT(context) {
  const guard = requireApiRole(context, "ADMIN");
  if (guard) return guard;

  const body = await context.request.json().catch(() => null);
  const parsed = updateRouteSchema.safeParse(body);
  if (!parsed.success)
    return jsonError(
      "Datos invalidos",
      400,
      parsed.error.flatten().fieldErrors,
    );

  await updateEventPageRoute(context.params.routeItemId, parsed.data);
  return jsonResponse({ ok: true });
}

export async function DELETE(context) {
  const guard = requireApiRole(context, "ADMIN");
  if (guard) return guard;

  await removeEventPageRoute(context.params.routeItemId);
  return jsonResponse({ ok: true });
}
