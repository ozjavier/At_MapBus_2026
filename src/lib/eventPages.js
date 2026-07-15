import { randomUUID } from "node:crypto";
import pool from "./db.js";
import { generateUniqueSlug } from "./slugify.js";

async function slugExists(slug, excludeId) {
  const [rows] = excludeId
    ? await pool.query(
        `SELECT id FROM event_pages WHERE slug = ? AND id != ? LIMIT 1`,
        [slug, excludeId],
      )
    : await pool.query(`SELECT id FROM event_pages WHERE slug = ? LIMIT 1`, [
        slug,
      ]);
  return rows.length > 0;
}

// --- Lectura ---

export async function listEventPages({ status } = {}) {
  const conditions = [];
  const params = [];
  if (status) {
    conditions.push("status = ?");
    params.push(status);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [rows] = await pool.query(
    `SELECT id, title, slug, place_name, event_date, cover_image_url, status, created_at
     FROM event_pages ${where}
     ORDER BY COALESCE(event_date, created_at) DESC`,
    params,
  );
  return rows;
}

export async function getEventPageById(id) {
  const [rows] = await pool.query(
    `SELECT * FROM event_pages WHERE id = ? LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function getEventPageBySlug(slug) {
  const [rows] = await pool.query(
    `SELECT * FROM event_pages WHERE slug = ? AND status = 'PUBLISHED' LIMIT 1`,
    [slug],
  );
  return rows[0] ?? null;
}

// El directorio de rutas propiamente dicho, ya con numero/nombre de ruta listo para pintar
export async function listEventPageRoutes(eventPageId) {
  const [rows] = await pool.query(
    `SELECT epr.id, epr.custom_instructions, epr.display_order,
            rg.id AS route_group_id, rg.route_number, rg.name
     FROM event_page_routes epr
     JOIN route_groups rg ON rg.id = epr.route_group_id
     WHERE epr.event_page_id = ?
     ORDER BY epr.display_order ASC`,
    [eventPageId],
  );
  return rows;
}

// --- Escritura: pagina de evento ---

export async function createEventPage({
  title,
  slug: requestedSlug,
  placeName,
  address,
  latitude,
  longitude,
  contentHtml,
  coverImageUrl,
  eventDate,
  metaTitle,
  metaDescription,
  status = "DRAFT",
}) {
  const slug = await generateUniqueSlug(requestedSlug || title, slugExists);
  const id = randomUUID();

  await pool.query(
    `INSERT INTO event_pages
       (id, title, slug, place_name, address, latitude, longitude, content_html, cover_image_url, event_date, meta_title, meta_description, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      title,
      slug,
      placeName ?? null,
      address ?? null,
      latitude ?? null,
      longitude ?? null,
      contentHtml,
      coverImageUrl ?? null,
      eventDate ?? null,
      metaTitle ?? null,
      metaDescription ?? null,
      status,
    ],
  );

  return id;
}

export async function updateEventPage(
  id,
  {
    title,
    slug: requestedSlug,
    placeName,
    address,
    latitude,
    longitude,
    contentHtml,
    coverImageUrl,
    eventDate,
    metaTitle,
    metaDescription,
    status,
  },
) {
  const current = await getEventPageById(id);
  if (!current) throw new Error("Pagina de evento no encontrada");

  const slug =
    requestedSlug && requestedSlug !== current.slug
      ? await generateUniqueSlug(requestedSlug, slugExists, id)
      : current.slug;

  await pool.query(
    `UPDATE event_pages SET
       title = ?, slug = ?, place_name = ?, address = ?, latitude = ?, longitude = ?,
       content_html = ?, cover_image_url = ?, event_date = ?, meta_title = ?, meta_description = ?, status = ?
     WHERE id = ?`,
    [
      title ?? current.title,
      slug,
      placeName ?? null,
      address ?? null,
      latitude ?? null,
      longitude ?? null,
      contentHtml ?? current.content_html,
      coverImageUrl ?? null,
      eventDate ?? null,
      metaTitle ?? null,
      metaDescription ?? null,
      status ?? current.status,
      id,
    ],
  );
}

export async function deleteEventPage(id) {
  await pool.query(`DELETE FROM event_pages WHERE id = ?`, [id]);
}

// --- Escritura: directorio de rutas del evento ---

async function nextDisplayOrder(eventPageId) {
  const [rows] = await pool.query(
    `SELECT COALESCE(MAX(display_order), -1) + 1 AS next_order FROM event_page_routes WHERE event_page_id = ?`,
    [eventPageId],
  );
  return rows[0].next_order;
}

export async function addEventPageRoute(
  eventPageId,
  { routeGroupId, customInstructions, displayOrder },
) {
  const id = randomUUID();
  const order = displayOrder ?? (await nextDisplayOrder(eventPageId));
  await pool.query(
    `INSERT INTO event_page_routes (id, event_page_id, route_group_id, custom_instructions, display_order)
     VALUES (?, ?, ?, ?, ?)`,
    [id, eventPageId, routeGroupId, customInstructions ?? null, order],
  );
  return id;
}

export async function updateEventPageRoute(
  id,
  { customInstructions, displayOrder },
) {
  await pool.query(
    `UPDATE event_page_routes SET custom_instructions = ?, display_order = ? WHERE id = ?`,
    [customInstructions ?? null, displayOrder, id],
  );
}

export async function removeEventPageRoute(id) {
  await pool.query(`DELETE FROM event_page_routes WHERE id = ?`, [id]);
}

// Reordena de una sola pasada tras un drag&drop en el admin
export async function reorderEventPageRoutes(eventPageId, orderedIds) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (let i = 0; i < orderedIds.length; i++) {
      await conn.query(
        `UPDATE event_page_routes SET display_order = ? WHERE id = ? AND event_page_id = ?`,
        [i, orderedIds[i], eventPageId],
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
