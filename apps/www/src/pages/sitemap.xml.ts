import type { APIRoute } from "astro";
import { getAllGuides, getAllReleases } from "../lib/content";

export const GET: APIRoute = async ({ site }) => {
  const baseUrl = (site ?? new URL("https://www.serial.tube")).origin;

  const releases = await getAllReleases();
  const guides = await getAllGuides();

  const urls: Array<{ loc: string; lastmod?: string }> = [
    { loc: "/" },
    { loc: "/pricing" },
    { loc: "/releases" },
    ...releases.map((release) => ({
      loc: `/releases/${release.id}`,
      lastmod: release.data.publish_date,
    })),
    { loc: "/guides" },
    ...guides.map((guide) => ({
      loc: `/guides/${guide.id}`,
      lastmod: guide.data.updated_at ?? guide.data.publish_date,
    })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${baseUrl}${u.loc}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ""}
  </url>`,
  )
  .join("\n")}
</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: { "Content-Type": "application/xml" },
  });
};
