export function slugify(text) {
  return text
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita acentos
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// slugExists(candidate, excludeId) -> boolean, la implementa cada modulo
// (articles.js, eventPages.js) contra su propia tabla.
export async function generateUniqueSlug(text, slugExists, excludeId = null) {
  const base = slugify(text) || "pagina";
  let candidate = base;
  let suffix = 2;
  while (await slugExists(candidate, excludeId)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}
