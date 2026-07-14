import { z } from 'zod';
import { requireUser } from '../../../lib/guards.js';
import { getNotificationPreferences, updateNotificationPreferences } from '../../../lib/profile.js';

const preferencesSchema = z.object({
  systemBrowser: z.boolean(),
  systemEmail: z.boolean(),
  planBrowser: z.boolean(),
  planEmail: z.boolean(),
  routeChangesBrowser: z.boolean(),
  routeChangesEmail: z.boolean(),
  marketingBrowser: z.boolean(),
  marketingEmail: z.boolean(),
});

export async function GET(context) {
  const guardResponse = requireUser(context);
  if (guardResponse) return guardResponse;

  const prefs = await getNotificationPreferences(context.locals.user.id);
  return new Response(JSON.stringify(prefs), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function PUT(context) {
  const guardResponse = requireUser(context);
  if (guardResponse) return guardResponse;

  const body = await context.request.json().catch(() => null);
  const parsed = preferencesSchema.safeParse(body);

  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const updated = await updateNotificationPreferences(context.locals.user.id, parsed.data);

  return new Response(JSON.stringify(updated), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
