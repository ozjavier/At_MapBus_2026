export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function jsonError(message, status = 400, details = null) {
  return jsonResponse({ error: message, ...(details ? { details } : {}) }, status);
}

// Igual que requireRole en guards.js, pero para endpoints JSON: nunca
// redirige, siempre responde con status + mensaje que el fetch() del
// cliente pueda leer.
export function requireApiRole(context, role) {
  if (!context.locals.user) return jsonError('No autenticado', 401);
  if (context.locals.user.role !== role) return jsonError('No autorizado', 403);
  return null;
}
