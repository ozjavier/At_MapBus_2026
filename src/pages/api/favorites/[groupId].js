import { z } from "zod";
import { requireUser } from "../../../lib/guards.js";
import { jsonResponse, jsonError } from "../../../lib/apiHelpers.js";
import {
  updateNotifyPreference,
  removeFavorite,
} from "../../../lib/routeFavorites.js";

const patchSchema = z.object({
  notifyChanges: z.boolean(),
});

export async function PATCH(context) {
  const guardResponse = requireUser(context);
  if (guardResponse) return guardResponse;

  const { groupId } = context.params;
  const body = await context.request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      "Datos inválidos",
      400,
      parsed.error.flatten().fieldErrors,
    );
  }

  try {
    await updateNotifyPreference(
      context.locals.user.id,
      groupId,
      parsed.data.notifyChanges,
    );
  } catch (error) {
    if (error.message === "FAVORITE_NOT_FOUND") {
      return jsonError("Ese favorito no existe", 404);
    }
    console.error("Error al actualizar favorito:", error);
    return jsonError("No se pudo actualizar el favorito", 500);
  }

  return jsonResponse({ ok: true });
}

export async function DELETE(context) {
  const guardResponse = requireUser(context);
  if (guardResponse) return guardResponse;

  const { groupId } = context.params;
  await removeFavorite(context.locals.user.id, groupId);

  return jsonResponse({ ok: true });
}
