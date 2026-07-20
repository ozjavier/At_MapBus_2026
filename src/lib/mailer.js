const RESEND_API_URL = "https://api.resend.com/emails";

/**
 * Envío de correo vía Resend (API HTTP directa, sin dependencia npm).
 * Se eligió porque migrar de pruebas a producción es solo verificar el
 * dominio en su dashboard — el código de aquí no cambia en absoluto.
 *
 * Sin RESEND_API_KEY configurada (ej. en dev antes de dar de alta la
 * cuenta), no truena el flujo: solo deja constancia en consola para
 * poder seguir probando el resto del flujo sin enviar correos reales.
 */
export async function sendEmail({ to, subject, html, text }) {
  const apiKey = import.meta.env.RESEND_API_KEY;
  const from = import.meta.env.EMAIL_FROM || "Atlixbus <onboarding@resend.dev>";

  if (!apiKey) {
    console.warn("[mailer] RESEND_API_KEY no configurada. Correo no enviado:");
    console.warn(`  Para: ${to}`);
    console.warn(`  Asunto: ${subject}`);
    console.warn(`  Texto: ${text}`);
    return { skipped: true };
  }

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ from, to, subject, html, text }),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    console.error(
      "[mailer] Error enviando correo con Resend:",
      res.status,
      errorBody,
    );
    throw new Error("EMAIL_SEND_FAILED");
  }

  return res.json();
}

export async function sendPasswordResetEmail(to, resetUrl) {
  const subject = "Recupera tu contraseña — Atlixbus";

  const text = `Recibimos una solicitud para restablecer tu contraseña en Atlixbus.

Abre este enlace para elegir una nueva contraseña (válido por 1 hora):
${resetUrl}

Si tú no la pediste, puedes ignorar este correo; tu contraseña seguirá siendo la misma.`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a2e;">
      <div style="background-color: #14213d; padding: 24px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 20px;">Atlixbus</h1>
      </div>
      <div style="padding: 24px; border: 1px solid #eee; border-top: none;">
        <h2 style="font-size: 18px; margin-top: 0;">Recupera tu contraseña</h2>
        <p>Recibimos una solicitud para restablecer tu contraseña. Da clic en el siguiente botón para elegir una nueva (el enlace es válido por 1 hora):</p>
        <p style="text-align: center; margin: 32px 0;">
          <a href="${resetUrl}" style="background-color: #0091ad; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; display: inline-block;">
            Elegir nueva contraseña
          </a>
        </p>
        <p style="font-size: 13px; color: #666;">Si el botón no funciona, copia y pega este enlace en tu navegador:<br>${resetUrl}</p>
        <p style="font-size: 13px; color: #666;">Si tú no solicitaste este cambio, puedes ignorar este correo — tu contraseña actual seguirá funcionando.</p>
      </div>
    </div>
  `;

  return sendEmail({ to, subject, html, text });
}

/**
 * Aviso de cambio de recorrido para un favorito con notificaciones
 * activadas. Usa el mismo transporte que la recuperación de contraseña.
 */
export async function sendRouteChangeEmail(
  to,
  { title, message, routeNumber },
) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a2e;">
      <div style="background-color: #14213d; padding: 24px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 20px;">Atlixbus</h1>
      </div>
      <div style="padding: 24px; border: 1px solid #eee; border-top: none;">
        <h2 style="font-size: 18px; margin-top: 0;">${title}</h2>
        <p>${message}</p>
        <p style="font-size: 13px; color: #666;">Recibiste este correo porque tienes la ruta ${routeNumber} en tus favoritos con avisos activados. Puedes cambiar esta preferencia en tu perfil, en Notificaciones o desde la estrella junto a la ruta.</p>
      </div>
    </div>
  `;

  return sendEmail({ to, subject: title, html, text: message });
}
