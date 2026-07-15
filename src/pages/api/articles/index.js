import { z } from "zod";
import {
  requireApiRole,
  jsonResponse,
  jsonError,
} from "../../../lib/apiHelpers.js";
import {
  listArticles,
  countArticles,
  createArticle,
} from "../../../lib/articles.js";

const createArticleSchema = z.object({
  title: z.string().trim().min(1),
  slug: z.string().trim().optional(),
  excerpt: z.string().max(500).optional(),
  contentHtml: z.string(),
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

  const url = new URL(context.request.url);
  const status = url.searchParams.get("status") || undefined;
  const search = url.searchParams.get("search") || undefined;
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const limit = 20;

  const [articles, total] = await Promise.all([
    listArticles({ status, search, limit, offset: (page - 1) * limit }),
    countArticles({ status, search }),
  ]);

  return jsonResponse({
    articles,
    total,
    page,
    pages: Math.ceil(total / limit),
  });
}

export async function POST(context) {
  const guard = requireApiRole(context, "ADMIN");
  if (guard) return guard;

  const body = await context.request.json().catch(() => null);
  const parsed = createArticleSchema.safeParse(body);
  if (!parsed.success)
    return jsonError(
      "Datos invalidos",
      400,
      parsed.error.flatten().fieldErrors,
    );

  const id = await createArticle({
    ...parsed.data,
    coverImageUrl: parsed.data.coverImageUrl || undefined,
    authorUserId: context.locals.user.id,
  });
  return jsonResponse({ id }, 201);
}
