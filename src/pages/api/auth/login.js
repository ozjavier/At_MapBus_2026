import { z } from 'zod';
import {
  findUserByEmail,
  verifyPassword,
  createSession,
  touchLastLogin,
} from '../../../lib/auth.js';
import { SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from '../../../lib/session.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST({ request, cookies }) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Correo o contraseña inválidos' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { email, password } = parsed.data;

  const user = await findUserByEmail(email);

  // Mismo mensaje de error tanto si el correo no existe como si la
  // contraseña es incorrecta, para no revelar qué correos están registrados.
  if (!user || !user.is_active) {
    return new Response(JSON.stringify({ error: 'Credenciales inválidas' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const validPassword = await verifyPassword(password, user.password_hash);
  if (!validPassword) {
    return new Response(JSON.stringify({ error: 'Credenciales inválidas' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const session = await createSession(user.id, {
    userAgent: request.headers.get('user-agent'),
  });

  cookies.set(SESSION_COOKIE_NAME, session.id, SESSION_COOKIE_OPTIONS);

  await touchLastLogin(user.id);

  return new Response(JSON.stringify({ ok: true, role: user.role }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
