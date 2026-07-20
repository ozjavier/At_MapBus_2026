import { requireUser } from "../../../../lib/guards.js";
import { jsonResponse } from "../../../../lib/apiHelpers.js";
import { markAsRead } from "../../../../lib/userNotifications.js";

export async function PATCH(context) {
  const guardResponse = requireUser(context);
  if (guardResponse) return guardResponse;

  await markAsRead(context.locals.user.id, context.params.id);
  return jsonResponse({ ok: true });
}
