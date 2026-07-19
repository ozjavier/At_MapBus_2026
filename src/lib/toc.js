// src/lib/toc.js

function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

export function buildTableOfContents(html) {
  if (!html) return { html: html ?? "", toc: [] };

  const toc = [];
  const usedSlugs = new Set();

  // Ahora incluye h2, h3 y h4 (los tres niveles que permite el editor)
  const withIds = html.replace(
    /<(h[234])([^>]*)>([\s\S]*?)<\/\1>/gi,
    (match, tag, attrs, inner) => {
      const text = inner.replace(/<[^>]+>/g, "").trim();
      if (!text) return match;

      const existingId = attrs.match(/\sid=["']([^"']+)["']/)?.[1];
      let id = existingId;

      if (!id) {
        const base = slugify(text) || "seccion";
        id = base;
        let i = 2;
        while (usedSlugs.has(id)) {
          id = `${base}-${i++}`;
        }
      }
      usedSlugs.add(id);

      const level = Number(tag.slice(1)); // 2, 3 o 4
      toc.push({ level, text, id });

      if (existingId) return match;
      return `<${tag}${attrs} id="${id}">${inner}</${tag}>`;
    },
  );

  return { html: withIds, toc };
}
