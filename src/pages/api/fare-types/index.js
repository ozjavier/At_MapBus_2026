import { z } from 'zod';
import { requireApiRole, jsonResponse, jsonError } from '../../../lib/apiHelpers.js';
import { listFareTypes, createFareType } from '../../../lib/fareTypes.js';

const createSchema = z.object({
  code: z.string().min(1),
  label: z.string().min(1),
  sortOrder: z.number().int().optional(),
});

export async function GET(context) {
  const guard = requireApiRole(context, 'ADMIN');
  if (guard) return guard;

  const types = await listFareTypes({ onlyActive: false });
  return jsonResponse(types);
}

export async function POST(context) {
  const guard = requireApiRole(context, 'ADMIN');
  if (guard) return guard;

  const body = await context.request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return jsonError('Datos invalidos', 400, parsed.error.flatten().fieldErrors);

  try {
    const id = await createFareType(parsed.data);
    return jsonResponse({ id }, 201);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return jsonError('Ya existe un tipo de tarifa con ese codigo', 409);
    throw err;
  }
}
