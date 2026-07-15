import { z } from "zod";
import {
  requireApiRole,
  jsonResponse,
  jsonError,
} from "../../../../../lib/apiHelpers.js";
import { reorderEventPageRoutes } from "../../../../../lib/eventPages.js";

const reorderSchema = z.object({
  orderedIds: z.array(z.string().uuid()),
});

export async function PATCH(context) {
  const guard = requireApiRole(context, "ADMIN");
  if (guard) return guard;

  const body = await context.request.json().catch(() => null);
  const parsed = reorderSchema.safeParse(body);
  if (!parsed.success)
    return jsonError(
      "Datos invalidos",
      400,
      parsed.error.flatten().fieldErrors,
    );

  await reorderEventPageRoutes(context.params.id, parsed.data.orderedIds);
  return jsonResponse({ ok: true });
}
