import { requireApiRole, jsonResponse } from '../../../../lib/apiHelpers.js';
import { getActivationLog } from '../../../../lib/routeGroups.js';

export async function GET(context) {
  const guard = requireApiRole(context, 'ADMIN');
  if (guard) return guard;

  const limitParam = new URL(context.request.url).searchParams.get('limit');
  const limit = limitParam ? Math.min(Number(limitParam), 200) : 50;

  const logs = await getActivationLog(context.params.id, { limit });
  return jsonResponse(logs);
}
