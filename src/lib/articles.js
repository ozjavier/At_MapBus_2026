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
    conditions.push("(title LIKE ? OR tags LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [rows] = await pool.query(
    `SELECT id, title, slug, excerpt, cover_image_url, tags, status, published_at, created_at, updated_at
     FROM articles
     ${where}
     ORDER BY COALESCE(published_at, created_at) DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  return rows;
}

export async function countArticles({ status, search } = {}) {
  const conditions = [];
  const params = [];
  if (status) {
    conditions.push("status = ?");
    params.push(status);
  }
  if (search) {
    conditions.push("(title LIKE ? OR tags LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total FROM articles ${where}`,
    params,
  );
  return rows[0].total;
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
