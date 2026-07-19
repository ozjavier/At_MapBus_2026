import { randomUUID } from "node:crypto";
import pool from "./db.js";
import { generateUniqueSlug } from "./slugify.js";

async function slugExists(slug, excludeId) {
  const [rows] = excludeId
    ? await pool.query(
        `SELECT id FROM articles WHERE slug = ? AND id != ? LIMIT 1`,
        [slug, excludeId],
      )
    : await pool.query(`SELECT id FROM articles WHERE slug = ? LIMIT 1`, [
        slug,
      ]);
  return rows.length > 0;
}

// --- Lectura ---

export async function listArticles({
  status,
  search,
  tag,
  sort = "recent",
  limit = 20,
  offset = 0,
} = {}) {
  const conditions = [];
  const params = [];

  if (status) {
    conditions.push("status = ?");
    params.push(status);
  }
  if (search) {
    conditions.push("(title LIKE ? OR excerpt LIKE ? OR tags LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (tag) {
    conditions.push("tags LIKE ?");
    params.push(`%${tag}%`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const orderBy =
    {
      recent: "COALESCE(published_at, created_at) DESC",
      oldest: "COALESCE(published_at, created_at) ASC",
      title_asc: "title ASC",
      title_desc: "title DESC",
    }[sort] || "COALESCE(published_at, created_at) DESC";

  const [rows] = await pool.query(
    `SELECT id, title, slug, excerpt, cover_image_url, tags, status, published_at, created_at, updated_at
     FROM articles
     ${where}
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  return rows;
}

export async function countArticles({ status, search, tag } = {}) {
  const conditions = [];
  const params = [];
  if (status) {
    conditions.push("status = ?");
    params.push(status);
  }
  if (search) {
    conditions.push("(title LIKE ? OR excerpt LIKE ? OR tags LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (tag) {
    conditions.push("tags LIKE ?");
    params.push(`%${tag}%`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total FROM articles ${where}`,
    params,
  );
  return rows[0].total;
}

// Lista de tags únicos entre los artículos publicados, para los chips de filtro
export async function getAllTags({ status = "PUBLISHED" } = {}) {
  const [rows] = await pool.query(
    `SELECT tags FROM articles WHERE status = ? AND tags IS NOT NULL AND tags != ''`,
    [status],
  );
  const tagSet = new Set();
  for (const row of rows) {
    (row.tags || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .forEach((t) => tagSet.add(t));
  }
  return Array.from(tagSet).sort((a, b) => a.localeCompare(b, "es"));
}

// Artículos recomendados/destacados: los más recientes, opcionalmente excluyendo algunos ids
export async function getFeaturedArticles({ limit = 3, excludeIds = [] } = {}) {
  const params = ["PUBLISHED"];
  let exclude = "";
  if (excludeIds.length > 0) {
    exclude = `AND id NOT IN (${excludeIds.map(() => "?").join(",")})`;
    params.push(...excludeIds);
  }
  params.push(limit);

  const [rows] = await pool.query(
    `SELECT id, title, slug, excerpt, cover_image_url, tags, published_at
     FROM articles
     WHERE status = ? ${exclude}
     ORDER BY COALESCE(published_at, created_at) DESC
     LIMIT ?`,
    params,
  );
  return rows;
}

export async function getArticleById(id) {
  const [rows] = await pool.query(
    `SELECT * FROM articles WHERE id = ? LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

// Uso publico: solo articulos ya publicados
export async function getArticleBySlug(slug) {
  const [rows] = await pool.query(
    `SELECT * FROM articles WHERE slug = ? AND status = 'PUBLISHED' LIMIT 1`,
    [slug],
  );
  return rows[0] ?? null;
}

// Rutas relacionadas de un articulo (chip "Sobre la Ruta 2" en la ficha)
export async function getArticleRoutes(articleId) {
  const [rows] = await pool.query(
    `SELECT rg.id, rg.route_number, rg.name
     FROM article_routes ar
     JOIN route_groups rg ON rg.id = ar.route_group_id
     WHERE ar.article_id = ?
     ORDER BY rg.route_number ASC`,
    [articleId],
  );
  return rows;
}

// Articulos publicados sobre una ruta (para pintar en /rutas/[id]) — este es
// el enlazado interno que ayuda al SEO de las fichas de ruta.
export async function getArticlesForRoute(routeGroupId, { limit = 5 } = {}) {
  const [rows] = await pool.query(
    `SELECT a.id, a.title, a.slug, a.excerpt, a.cover_image_url, a.published_at
     FROM article_routes ar
     JOIN articles a ON a.id = ar.article_id
     WHERE ar.route_group_id = ? AND a.status = 'PUBLISHED'
     ORDER BY a.published_at DESC
     LIMIT ?`,
    [routeGroupId, limit],
  );
  return rows;
}

// --- Escritura ---

export async function createArticle({
  title,
  slug: requestedSlug,
  excerpt,
  contentHtml,
  contentJson,
  coverImageUrl,
  tags,
  metaTitle,
  metaDescription,
  status = "DRAFT",
  authorUserId,
  routeGroupIds = [],
}) {
  const slug = await generateUniqueSlug(requestedSlug || title, slugExists);
  const id = randomUUID();
  const publishedAt = status === "PUBLISHED" ? new Date() : null;

  await pool.query(
    `INSERT INTO articles
       (id, title, slug, excerpt, content_html, content_json, cover_image_url, tags, meta_title, meta_description, status, published_at, author_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      title,
      slug,
      excerpt ?? null,
      contentHtml,
      JSON.stringify(contentJson ?? null),
      coverImageUrl ?? null,
      tags ?? null,
      metaTitle ?? null,
      metaDescription ?? null,
      status,
      publishedAt,
      authorUserId ?? null,
    ],
  );

  if (routeGroupIds.length > 0) await setArticleRoutes(id, routeGroupIds);

  return id;
}

export async function updateArticle(
  id,
  {
    title,
    slug: requestedSlug,
    excerpt,
    contentHtml,
    contentJson,
    coverImageUrl,
    tags,
    metaTitle,
    metaDescription,
    status,
    routeGroupIds,
  },
) {
  const current = await getArticleById(id);
  if (!current) throw new Error("Articulo no encontrado");

  const slug =
    requestedSlug && requestedSlug !== current.slug
      ? await generateUniqueSlug(requestedSlug, slugExists, id)
      : current.slug;

  // Si pasa a PUBLISHED por primera vez fijamos la fecha ahora; si ya tenia
  // published_at lo respetamos (editar no debe resetear la fecha de publicacion).
  const publishedAt =
    status === "PUBLISHED"
      ? (current.published_at ?? new Date())
      : current.published_at;

  await pool.query(
    `UPDATE articles SET
       title = ?, slug = ?, excerpt = ?, content_html = ?, content_json = ?, cover_image_url = ?,
       tags = ?, meta_title = ?, meta_description = ?, status = ?, published_at = ?
     WHERE id = ?`,
    [
      title ?? current.title,
      slug,
      excerpt ?? null,
      contentHtml ?? current.content_html,
      contentJson !== undefined
        ? JSON.stringify(contentJson)
        : current.content_json,
      coverImageUrl ?? null,
      tags ?? null,
      metaTitle ?? null,
      metaDescription ?? null,
      status ?? current.status,
      publishedAt,
      id,
    ],
  );

  if (routeGroupIds) await setArticleRoutes(id, routeGroupIds);
}

export async function deleteArticle(id) {
  await pool.query(`DELETE FROM articles WHERE id = ?`, [id]);
}

// Reemplaza el set completo de rutas relacionadas — mas simple de mantener que un diff
export async function setArticleRoutes(articleId, routeGroupIds) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(`DELETE FROM article_routes WHERE article_id = ?`, [
      articleId,
    ]);
    if (routeGroupIds.length > 0) {
      const values = routeGroupIds.map((routeGroupId) => [
        articleId,
        routeGroupId,
      ]);
      await conn.query(
        `INSERT INTO article_routes (article_id, route_group_id) VALUES ?`,
        [values],
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function getRelatedArticles(articleId, tags, { limit = 3 } = {}) {
  if (!tags) return [];
  const firstTag = tags.split(",")[0].trim();
  if (!firstTag) return [];
  const [rows] = await pool.query(
    `SELECT id, title, slug, excerpt, cover_image_url, published_at
     FROM articles
     WHERE status = 'PUBLISHED' AND id != ? AND tags LIKE ?
     ORDER BY COALESCE(published_at, created_at) DESC
     LIMIT ?`,
    [articleId, `%${firstTag}%`, limit],
  );
  return rows;
}

export async function getAdjacentArticles(referenceDate) {
  const [prevRows] = await pool.query(
    `SELECT slug, title FROM articles
     WHERE status = 'PUBLISHED' AND COALESCE(published_at, created_at) < ?
     ORDER BY COALESCE(published_at, created_at) DESC LIMIT 1`,
    [referenceDate],
  );
  const [nextRows] = await pool.query(
    `SELECT slug, title FROM articles
     WHERE status = 'PUBLISHED' AND COALESCE(published_at, created_at) > ?
     ORDER BY COALESCE(published_at, created_at) ASC LIMIT 1`,
    [referenceDate],
  );
  return { prev: prevRows[0] ?? null, next: nextRows[0] ?? null };
}
