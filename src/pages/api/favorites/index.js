import { z } from "zod";
import { requireUser } from "../../../lib/guards.js";
import { jsonResponse, jsonError } from "../../../lib/apiHelpers.js";
import {
  listFavoritesByUser,
  addFavorite,
} from "../../../lib/routeFavorites.js";

const addSchema = z.object({
  routeGroupId: z.string().uuid("routeGroupId inválido"),
  notifyChanges: z.boolean().optional().default(false),
});

export async function GET(context) {
  const guardResponse = requireUser(context);
  if (guardResponse) return guardResponse;

  const favorites = await listFavoritesByUser(context.locals.user.id);
  return jsonResponse(favorites);
}

export async function POST(context) {
  const guardResponse = requireUser(context);
  if (guardResponse) return guardResponse;

  const body = await context.request.json().catch(() => null);
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      "Datos inválidos",
      400,
      parsed.error.flatten().fieldErrors,
    );
  }

  try {
    await addFavorite(
      context.locals.user.id,
      parsed.data.routeGroupId,
      parsed.data.notifyChanges,
    );
  } catch (error) {
    if (error.message === "ROUTE_GROUP_NOT_FOUND") {
      return jsonError("La ruta indicada no existe", 404);
    }
    console.error("Error al guardar favorito:", error);
    return jsonError("No se pudo guardar el favorito", 500);
  }

  return jsonResponse({ ok: true }, 201);
}
