import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/sitemap")({
  server: {
    handlers: {
      GET: ({ request }: { request: Request }) => {
        const baseUrl = new URL(request.url).origin;

        const urls: Array<{ loc: string; lastmod?: string }> = [{ loc: "/" }];

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
      },
    },
  },
});
