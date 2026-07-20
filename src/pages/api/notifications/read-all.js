import { requireUser } from "../../../lib/guards.js";
import { jsonResponse } from "../../../lib/apiHelpers.js";
import { markAllAsRead } from "../../../lib/userNotifications.js";

export async function PATCH(context) {
  const guardResponse = requireUser(context);
  if (guardResponse) return guardResponse;

  await markAllAsRead(context.locals.user.id);
  return jsonResponse({ ok: true });
}
