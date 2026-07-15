import { SITE_URL } from "../lib/site.js";

export async function GET() {
  const body = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api
Disallow: /perfil

Sitemap: ${new URL("/sitemap.xml", SITE_URL).toString()}
`;

  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}
