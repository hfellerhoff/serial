const screenshotDataUrls = import.meta.glob<string>(
  "../../../public/{guides,releases}/*/og.png",
  {
    eager: true,
    import: "default",
    query: "?inline",
  },
);

export function getOgScreenshotDataUrl(
  contentType: "guides" | "releases",
  slug: string,
) {
  return screenshotDataUrls[`../../../public/${contentType}/${slug}/og.png`];
}
