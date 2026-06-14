import { renderReleaseOgImage } from "./release";
import { getOgScreenshotDataUrl } from "./screenshotDataUrls";
import { getGuidePostWithSlug } from "~/lib/markdown/loaders";

export const RELEASE_OG_CACHE_CONTROL =
  "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800";

export async function getGuideOgResponse(slug: string) {
  const guide = getGuidePostWithSlug(slug);
  if (!guide) {
    return new Response("Not Found", { status: 404 });
  }

  const screenshotDataUrl = getOgScreenshotDataUrl("guides", guide.slug);
  const image = await renderReleaseOgImage(guide, screenshotDataUrl);
  return new Response(new Uint8Array(image), {
    status: 200,
    headers: {
      "Cache-Control": RELEASE_OG_CACHE_CONTROL,
      "Content-Type": "image/png",
    },
  });
}
