import { z } from "zod";
import {
  requireApiRole,
  jsonResponse,
  jsonError,
} from "../../../../../lib/apiHelpers.js";
import {
  getEventPageById,
  listEventPageRoutes,
  addEventPageRoute,
} from "../../../../../lib/eventPages.js";

const addRouteSchema = z.object({
  routeGroupId: z.string().uuid(),
  customInstructions: z.string().optional(),
});

export async function GET(context) {
  const guard = requireApiRole(context, "ADMIN");
  if (guard) return guard;

  const event = await getEventPageById(context.params.id);
  if (!event) return jsonError("Pagina no encontrada", 404);

  const routes = await listEventPageRoutes(context.params.id);
  return jsonResponse(routes);
}

export async function POST(context) {
  const guard = requireApiRole(context, "ADMIN");
  if (guard) return guard;

  const event = await getEventPageById(context.params.id);
  if (!event) return jsonError("Pagina no encontrada", 404);

  const body = await context.request.json().catch(() => null);
  const parsed = addRouteSchema.safeParse(body);
  if (!parsed.success)
    return jsonError(
      "Datos invalidos",
      400,
      parsed.error.flatten().fieldErrors,
    );

  const id = await addEventPageRoute(context.params.id, parsed.data);
  return jsonResponse({ id }, 201);
}
