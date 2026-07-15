import { z } from "zod";
import {
  requireApiRole,
  jsonResponse,
  jsonError,
} from "../../../lib/apiHelpers.js";
import {
  getArticleById,
  updateArticle,
  deleteArticle,
  getArticleRoutes,
} from "../../../lib/articles.js";

const updateArticleSchema = z.object({
  title: z.string().trim().min(1).optional(),
  slug: z.string().trim().optional(),
  excerpt: z.string().max(500).optional(),
  contentHtml: z.string().optional(),
  contentJson: z.any().optional(),
  coverImageUrl: z.string().url().optional().or(z.literal("")),
  tags: z.string().optional(),
  metaTitle: z.string().max(255).optional(),
  metaDescription: z.string().max(500).optional(),
  status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
  routeGroupIds: z.array(z.string().uuid()).optional(),
});

export async function GET(context) {
  const guard = requireApiRole(context, "ADMIN");
  if (guard) return guard;

  const article = await getArticleById(context.params.id);
  if (!article) return jsonError("Articulo no encontrado", 404);

  const relatedRoutes = await getArticleRoutes(article.id);
  return jsonResponse({ ...article, relatedRoutes });
}

export async function PUT(context) {
  const guard = requireApiRole(context, "ADMIN");
  if (guard) return guard;

  const existing = await getArticleById(context.params.id);
  if (!existing) return jsonError("Articulo no encontrado", 404);

  const body = await context.request.json().catch(() => null);
  const parsed = updateArticleSchema.safeParse(body);
  if (!parsed.success)
    return jsonError(
      "Datos invalidos",
      400,
      parsed.error.flatten().fieldErrors,
    );

  await updateArticle(context.params.id, {
    ...parsed.data,
    coverImageUrl: parsed.data.coverImageUrl || undefined,
  });
  return jsonResponse({ ok: true });
}

export async function DELETE(context) {
  const guard = requireApiRole(context, "ADMIN");
  if (guard) return guard;

  const existing = await getArticleById(context.params.id);
  if (!existing) return jsonError("Articulo no encontrado", 404);

  await deleteArticle(context.params.id);
  return jsonResponse({ ok: true });
}
