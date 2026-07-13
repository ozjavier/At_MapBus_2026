import { z } from 'zod';
import { createUser, findUserByEmail } from '../../../lib/auth.js';

const registerSchema = z.object({
  email: z.string().email('Correo inválido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  name: z.string().trim().min(1).optional(),
});

export async function POST({ request }) {
  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: 'Datos inválidos',
        details: parsed.error.flatten().fieldErrors,
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { email, password, name } = parsed.data;

  const existing = await findUserByEmail(email);
  if (existing) {
    return new Response(
      JSON.stringify({ error: 'Ese correo ya está registrado' }),
      { status: 409, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const userId = await createUser({ email, password, name });

  return new Response(JSON.stringify({ id: userId, email }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
}
