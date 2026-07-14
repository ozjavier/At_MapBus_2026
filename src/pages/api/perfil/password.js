import { z } from 'zod';
import { requireUser } from '../../../lib/guards.js';
import { changeUserPassword } from '../../../lib/profile.js';

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'La contraseña actual es requerida'),
  newPassword: z.string().min(8, 'La nueva contraseña debe tener al menos 8 caracteres'),
});

export async function PUT(context) {
  const guardResponse = requireUser(context);
  if (guardResponse) return guardResponse;

  const body = await context.request.json().catch(() => null);
  const parsed = passwordSchema.safeParse(body);

  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { currentPassword, newPassword } = parsed.data;

  try {
    await changeUserPassword(context.locals.user.id, currentPassword, newPassword);
  } catch (error) {
    if (error.message === 'CURRENT_PASSWORD_INVALID') {
      return new Response(JSON.stringify({ error: 'La contraseña actual es incorrecta' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    console.error('Error al cambiar la contraseña:', error);
    return new Response(JSON.stringify({ error: 'No se pudo cambiar la contraseña' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
