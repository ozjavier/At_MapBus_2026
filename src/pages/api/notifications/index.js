import { requireUser } from "../../../lib/guards.js";
import { jsonResponse } from "../../../lib/apiHelpers.js";
import {
  listNotifications,
  countUnread,
} from "../../../lib/userNotifications.js";

export async function GET(context) {
  const guardResponse = requireUser(context);
  if (guardResponse) return guardResponse;

  const [notifications, unreadCount] = await Promise.all([
    listNotifications(context.locals.user.id),
    countUnread(context.locals.user.id),
  ]);

  return jsonResponse({ notifications, unreadCount });
}
