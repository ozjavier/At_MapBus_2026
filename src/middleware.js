import { defineMiddleware } from 'astro:middleware';
import { getUserFromSessionId } from './lib/auth.js';
import { SESSION_COOKIE_NAME } from './lib/session.js';

export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.user = null;

  const sessionId = context.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (sessionId) {
    const user = await getUserFromSessionId(sessionId);

    if (user) {
      context.locals.user = user;
    } else {
      // Sesión inválida o expirada: limpiamos la cookie del navegador.
      context.cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
    }
  }

  return next();
});
