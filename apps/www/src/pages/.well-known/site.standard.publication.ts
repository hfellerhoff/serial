import type { APIRoute } from "astro";
import { STANDARD_SITE_PUBLICATION_URI } from "../../lib/site";
import { getConfiguredPublicationUri } from "../../lib/standard-site";

export const GET: APIRoute = () => {
  const publicationUri = getConfiguredPublicationUri(
    STANDARD_SITE_PUBLICATION_URI,
  );

  if (!publicationUri) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(publicationUri, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
