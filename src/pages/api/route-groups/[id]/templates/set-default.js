import {
  requireApiRole,
  jsonResponse,
  jsonError,
} from "../../../../../../lib/apiHelpers.js";
import { setDefaultTemplate } from "../../../../../../lib/routeGroups.js";

export async function PATCH(context) {
  const guard = requireApiRole(context, "ADMIN");
  if (guard) return guard;

  try {
    await setDefaultTemplate(context.params.id, context.params.routeId);
    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonError(err.message, 400);
  }
}
