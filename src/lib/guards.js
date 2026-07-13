// Uso en el frontmatter de una página .astro:
//
//   const guardResponse = requireUser(Astro);
//   if (guardResponse) return guardResponse;
//
// Si el usuario no tiene sesión, redirige a /login.
export function requireUser(context) {
  if (!context.locals.user) {
    return context.redirect('/login');
  }
  return null;
}

// Igual que requireUser, pero además exige un rol específico.
// Si el usuario tiene sesión pero no el rol correcto, responde 403
// en vez de redirigir (para no dar pistas de que la ruta existe
// simplemente cambiando el rol).
export function requireRole(context, role) {
  const redirectResponse = requireUser(context);
  if (redirectResponse) return redirectResponse;

  if (context.locals.user.role !== role) {
    return new Response('No autorizado', { status: 403 });
  }

  return null;
}
