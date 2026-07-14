import { z } from 'zod';
import { requireUser } from '../../../lib/guards.js';
import { findUserByEmail } from '../../../lib/auth.js';
import { getProfileById, updateProfile } from '../../../lib/profile.js';

const updateSchema = z.object({
  firstName: z.string().trim().min(1, 'El nombre es requerido').max(100),
  lastName: z.string().trim().max(100).optional().default(''),
  email: z.string().email('Correo inválido'),
});

export async function GET(context) {
  const guardResponse = requireUser(context);
  if (guardResponse) return guardResponse;

  const profile = await getProfileById(context.locals.user.id);
  return new Response(JSON.stringify(profile), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function PUT(context) {
  const guardResponse = requireUser(context);
  if (guardResponse) return guardResponse;

  const body = await context.request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { firstName, lastName, email } = parsed.data;
  const userId = context.locals.user.id;

  // Si cambia el correo, confirmamos que no esté en uso por otra cuenta.
  if (email !== context.locals.user.email) {
    const existing = await findUserByEmail(email);
    if (existing && existing.id !== userId) {
      return new Response(JSON.stringify({ error: 'Ese correo ya está registrado' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  const updated = await updateProfile(userId, { firstName, lastName, email });

  return new Response(JSON.stringify(updated), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
