import { renderReleaseOgImage } from "./release";
import { getOgScreenshotDataUrl } from "./screenshotDataUrls";
import { findReleaseWithSlug } from "~/lib/markdown/loaders";

export const RELEASE_OG_CACHE_CONTROL =
  "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800";

export async function getReleaseOgResponse(slug: string) {
  const release = findReleaseWithSlug(slug);
  if (!release) {
    return new Response("Not Found", { status: 404 });
  }

  const screenshotDataUrl = getOgScreenshotDataUrl("releases", release.slug);
  const image = await renderReleaseOgImage(release, screenshotDataUrl);
  return new Response(new Uint8Array(image), {
    status: 200,
    headers: {
      "Cache-Control": RELEASE_OG_CACHE_CONTROL,
      "Content-Type": "image/png",
    },
  });
}
