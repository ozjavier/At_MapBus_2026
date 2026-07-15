import { z } from "zod";
import {
  requireApiRole,
  jsonResponse,
  jsonError,
} from "../../../lib/apiHelpers.js";
import {
  getEventPageById,
  updateEventPage,
  deleteEventPage,
} from "../../../lib/eventPages.js";

const updateEventPageSchema = z.object({
  title: z.string().trim().min(1).optional(),
  slug: z.string().trim().optional(),
  placeName: z.string().optional(),
  address: z.string().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  contentHtml: z.string().optional(),
  contentJson: z.any().optional(),
  coverImageUrl: z.string().url().optional().or(z.literal("")),
  eventDate: z.string().optional(),
  metaTitle: z.string().max(255).optional(),
  metaDescription: z.string().max(500).optional(),
  status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
});

export async function GET(context) {
  const guard = requireApiRole(context, "ADMIN");
  if (guard) return guard;

  const event = await getEventPageById(context.params.id);
  if (!event) return jsonError("Pagina no encontrada", 404);
  return jsonResponse(event);
}

export async function PUT(context) {
  const guard = requireApiRole(context, "ADMIN");
  if (guard) return guard;

  const existing = await getEventPageById(context.params.id);
  if (!existing) return jsonError("Pagina no encontrada", 404);

  const body = await context.request.json().catch(() => null);
  const parsed = updateEventPageSchema.safeParse(body);
  if (!parsed.success)
    return jsonError(
      "Datos invalidos",
      400,
      parsed.error.flatten().fieldErrors,
    );

  await updateEventPage(context.params.id, {
    ...parsed.data,
    coverImageUrl: parsed.data.coverImageUrl || undefined,
  });
  return jsonResponse({ ok: true });
}

export async function DELETE(context) {
  const guard = requireApiRole(context, "ADMIN");
  if (guard) return guard;

  const existing = await getEventPageById(context.params.id);
  if (!existing) return jsonError("Pagina no encontrada", 404);

  await deleteEventPage(context.params.id);
  return jsonResponse({ ok: true });
}
