import { createFileRoute } from "@tanstack/react-router";
import { IS_MAIN_INSTANCE } from "~/lib/constants";
import { getAllBlogPosts, getAllReleases } from "~/lib/markdown/loaders";

export const Route = createFileRoute("/sitemap")({
  server: {
    handlers: {
      GET: ({ request }: { request: Request }) => {
        const baseUrl = new URL(request.url).origin;

        const urls: Array<{ loc: string; lastmod?: string }> = [{ loc: "/" }];

        if (IS_MAIN_INSTANCE) {
          const releases = getAllReleases();
          const blogPosts = getAllBlogPosts();

          urls.push(
            { loc: "/welcome" },
            { loc: "/releases" },
            ...releases.map((r) => ({
              loc: `/releases/${r.slug}`,
              lastmod: r.publish_date,
            })),
            { loc: "/blog" },
            ...blogPosts.map((p) => ({
              loc: `/blog/${p.slug}`,
              lastmod: p.updated_at ?? p.publish_date,
            })),
          );
        }

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
