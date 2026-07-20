import { z } from "zod";
import { findUserByEmail } from "../../../lib/auth.js";
import { createPasswordResetToken } from "../../../lib/passwordReset.js";
import { sendPasswordResetEmail } from "../../../lib/mailer.js";
import { jsonResponse, jsonError } from "../../../lib/apiHelpers.js";
import { SITE_URL } from "../../../lib/site.js";

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

// Mismo mensaje siempre exista o no la cuenta, igual que en /api/auth/login,
// para no revelar qué correos están registrados.
const GENERIC_MESSAGE =
  "Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña.";

export async function POST({ request }) {
  const body = await request.json().catch(() => null);
  const parsed = forgotPasswordSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(
      "Correo inválido",
      400,
      parsed.error.flatten().fieldErrors,
    );
  }

  const { email } = parsed.data;
  const user = await findUserByEmail(email);

  if (user && user.is_active) {
    const rawToken = await createPasswordResetToken(user.id);
    const resetUrl = new URL(
      `/restablecer-password?token=${rawToken}`,
      SITE_URL,
    ).toString();

    try {
      await sendPasswordResetEmail(user.email, resetUrl);
    } catch (err) {
      // No delatamos el fallo de envío al cliente: seguimos devolviendo
      // el mensaje genérico, pero sí queda registrado en el log del servidor.
      console.error("[forgot-password] Error enviando correo:", err);
    }
  }

  return jsonResponse({ message: GENERIC_MESSAGE });
}
