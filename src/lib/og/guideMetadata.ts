import type { BlogPost } from "content-collections";

const SITE_NAME = "Serial";

type GuideMetadata = Pick<
  BlogPost,
  "description" | "publish_date" | "slug" | "title"
>;

export function buildGuideMetadata(guide: GuideMetadata, baseUrl: string) {
  const releaseUrl = new URL(`/guides/${guide.slug}`, baseUrl).toString();
  const imageUrl = new URL(`/api/og/guides/${guide.slug}`, baseUrl).toString();
  const description = guide.description ?? `Guide for ${guide.title}`;

  return {
    links: [{ rel: "canonical", href: releaseUrl }],
    meta: [
      { title: `${guide.title} | ${SITE_NAME}` },
      { name: "description", content: description },
      { property: "og:title", content: guide.title },
      { property: "og:description", content: description },
      { property: "og:type", content: "article" },
      { property: "og:site_name", content: SITE_NAME },
      { property: "og:url", content: releaseUrl },
      { property: "og:image", content: imageUrl },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      {
        property: "og:image:alt",
        content: `${SITE_NAME} release: ${guide.title}`,
      },
      {
        property: "article:published_time",
        content: guide.publish_date,
      },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: guide.title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: imageUrl },
      {
        name: "twitter:image:alt",
        content: `${SITE_NAME} guide: ${guide.title}`,
      },
    ],
  };
}
