import type { Release } from "content-collections";

const SITE_NAME = "Serial";

type ReleaseMetadata = Pick<
  Release,
  "description" | "publish_date" | "slug" | "title"
>;

export function buildReleaseMetadata(
  release: ReleaseMetadata,
  baseUrl: string,
) {
  const releaseUrl = new URL(`/releases/${release.slug}`, baseUrl).toString();
  const imageUrl = new URL(
    `/api/og/releases/${release.slug}`,
    baseUrl,
  ).toString();
  const description =
    release.description ?? `Release notes for ${release.title}`;

  return {
    links: [{ rel: "canonical", href: releaseUrl }],
    meta: [
      { title: `${release.title} | ${SITE_NAME}` },
      { name: "description", content: description },
      { property: "og:title", content: release.title },
      { property: "og:description", content: description },
      { property: "og:type", content: "article" },
      { property: "og:site_name", content: SITE_NAME },
      { property: "og:url", content: releaseUrl },
      { property: "og:image", content: imageUrl },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      {
        property: "og:image:alt",
        content: `${SITE_NAME} release: ${release.title}`,
      },
      {
        property: "article:published_time",
        content: release.publish_date,
      },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: release.title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: imageUrl },
      {
        name: "twitter:image:alt",
        content: `${SITE_NAME} release: ${release.title}`,
      },
    ],
  };
}
