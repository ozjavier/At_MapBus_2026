import { listArticles } from "../lib/articles.js";
import { listEventPages } from "../lib/eventPages.js";
import { SITE_URL } from "../lib/site.js";

function urlEntry(loc, lastmod, changefreq = "weekly", priority = "0.6") {
  return `<url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}<changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;
}

export async function GET() {
  const [articles, events] = await Promise.all([
    listArticles({ status: "PUBLISHED", limit: 1000 }),
    listEventPages({ status: "PUBLISHED" }),
  ]);

  const staticEntries = [
    urlEntry(SITE_URL, undefined, "daily", "1.0"),
    urlEntry(new URL("/blog", SITE_URL).toString(), undefined, "daily", "0.8"),
    urlEntry(
      new URL("/eventos", SITE_URL).toString(),
      undefined,
      "daily",
      "0.7",
    ),
  ];

  const articleEntries = articles.map((a) =>
    urlEntry(
      new URL(`/blog/${a.slug}`, SITE_URL).toString(),
      a.updated_at ? new Date(a.updated_at).toISOString() : undefined,
      "monthly",
      "0.7",
    ),
  );

  const eventEntries = events.map((e) =>
    urlEntry(
      new URL(`/eventos/${e.slug}`, SITE_URL).toString(),
      e.created_at ? new Date(e.created_at).toISOString() : undefined,
      "weekly",
      "0.7",
    ),
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticEntries, ...articleEntries, ...eventEntries].join("\n")}
</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: { "Content-Type": "application/xml" },
  });
}
