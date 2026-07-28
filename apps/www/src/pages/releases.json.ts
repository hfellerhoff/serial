import type { APIRoute } from "astro";
import { getAllReleases } from "../lib/content";

export const GET: APIRoute = async () => {
  const releases = await getAllReleases();

  const items = releases.map((release) => ({
    slug: release.id,
    title: release.data.title,
    description: release.data.description,
    publish_date: release.data.publish_date,
  }));

  return new Response(JSON.stringify({ releases: items }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
