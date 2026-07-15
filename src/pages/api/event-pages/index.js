import { z } from "zod";
import {
  requireApiRole,
  jsonResponse,
  jsonError,
} from "../../../lib/apiHelpers.js";
import { listEventPages, createEventPage } from "../../../lib/eventPages.js";

const createEventPageSchema = z.object({
  title: z.string().trim().min(1),
  slug: z.string().trim().optional(),
  placeName: z.string().optional(),
  address: z.string().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  contentHtml: z.string(),
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

  const status =
    new URL(context.request.url).searchParams.get("status") || undefined;
  const events = await listEventPages({ status });
  return jsonResponse(events);
}

export async function POST(context) {
  const guard = requireApiRole(context, "ADMIN");
  if (guard) return guard;

  const body = await context.request.json().catch(() => null);
  const parsed = createEventPageSchema.safeParse(body);
  if (!parsed.success)
    return jsonError(
      "Datos invalidos",
      400,
      parsed.error.flatten().fieldErrors,
    );

  const id = await createEventPage({
    ...parsed.data,
    coverImageUrl: parsed.data.coverImageUrl || undefined,
  });
  return jsonResponse({ id }, 201);
}
