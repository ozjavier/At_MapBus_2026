export const SESSION_COOKIE_NAME =
  import.meta.env.SESSION_COOKIE_NAME || 'atlixbus_session';

const durationDays = Number(import.meta.env.SESSION_DURATION_DAYS || 7);

export const SESSION_DURATION_MS = durationDays * 24 * 60 * 60 * 1000;

// httpOnly: JS del navegador no puede leerla (protege contra XSS robando el token).
// sameSite 'lax': suficiente para este caso y no rompe la navegación normal.
// secure: solo en producción (HTTPS); en local con Laragon normalmente es HTTP.
export const SESSION_COOKIE_OPTIONS = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax',
  secure: import.meta.env.PROD === true,
  maxAge: durationDays * 24 * 60 * 60,
};
