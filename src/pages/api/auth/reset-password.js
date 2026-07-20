import { z } from "zod";
import { resetPasswordWithToken } from "../../../lib/passwordReset.js";
import { jsonResponse, jsonError } from "../../../lib/apiHelpers.js";

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres"),
});

export async function POST({ request }) {
  const body = await request.json().catch(() => null);
  const parsed = resetPasswordSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(
      "Datos inválidos",
      400,
      parsed.error.flatten().fieldErrors,
    );
  }

  const { token, newPassword } = parsed.data;

  try {
    await resetPasswordWithToken(token, newPassword);
  } catch (err) {
    if (err.message === "TOKEN_INVALID") {
      return jsonError(
        "El enlace no es válido o ya expiró. Solicita uno nuevo.",
        400,
      );
    }
    console.error("[reset-password] Error inesperado:", err);
    return jsonError("No se pudo restablecer la contraseña", 500);
  }

  return jsonResponse({ ok: true });
}
