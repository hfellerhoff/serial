import { describe, expect, it } from "vitest";
import type { BookmarkClassification } from "~/lib/content/classification";
import {
  classifyDocument,
  classifyUrl,
  createFallbackPreview,
  isValidNativeContentIdForUrl,
  mergeClassification,
  mergePreview,
  youtubeThumbnailUrl,
} from "~/lib/content/classification";

const YOUTUBE_ID = "dQw4w9WgXcQ";
const PEERTUBE_ID = "9c9de5e8-0a1e-484a-b099-e80766180a6d";

function classification(
  overrides: Partial<BookmarkClassification> = {},
): BookmarkClassification {
  return {
    platform: "website",
    contentType: "text",
    orientation: null,
    contentId: null,
    classificationSource: "url",
    classifierVersion: 1,
    ...overrides,
  };
}

describe("content classification", () => {
  it.each([
    [`https://youtube.com/watch?v=${YOUTUBE_ID}`, "youtube", "video", null],
    [`https://youtu.be/${YOUTUBE_ID}`, "youtube", "video", null],
    [
      `https://youtube.com/shorts/${YOUTUBE_ID}`,
      "youtube",
      "video",
      "vertical",
    ],
    ["https://youtube.com/@serial", "youtube", "text", null],
    ["https://youtube.com/watch?v=invalid", "youtube", "text", null],
    ["https://nebula.tv/videos/episode", "nebula", "video", "horizontal"],
    ["https://nebula.tv/myshows", "nebula", "text", null],
    ["https://example.com/article", "website", "text", null],
  ] as const)("classifies %s", (url, platform, contentType, orientation) => {
    expect(classifyUrl(url)).toMatchObject({
      platform,
      contentType,
      orientation,
    });
  });

  it("origin-qualifies PeerTube identity and refuses cross-origin identity", () => {
    const url = `https://tube.example/w/${PEERTUBE_ID}`;
    expect(classifyUrl(url)).toMatchObject({
      platform: "peertube",
      contentType: "video",
      contentId: `https://tube.example|${PEERTUBE_ID}`,
      orientation: null,
    });
    expect(
      isValidNativeContentIdForUrl({
        platform: "peertube",
        contentId: `https://other.example|${PEERTUBE_ID}`,
        primaryUrl: url,
      }),
    ).toBe(false);
  });

  it("uses strong primary-resource evidence but ignores embedded media", () => {
    expect(
      classifyDocument({
        primaryUrl: "https://example.com/story",
        source: "server-static-fetch",
        ogType: "video.other",
      }),
    ).toMatchObject({ platform: "website", contentType: "video" });
    expect(
      classifyDocument({
        primaryUrl: "https://example.com/story",
        source: "server-static-fetch",
        schemaTypes: ["Article"],
      }),
    ).toMatchObject({ platform: "website", contentType: "text" });
  });

  it("recognizes PeerTube text pages from direct document evidence", () => {
    expect(
      classifyDocument({
        primaryUrl: "https://tube.example/c/serial/videos",
        source: "server-static-fetch",
        platformHint: "peertube",
      }),
    ).toMatchObject({
      platform: "peertube",
      contentType: "text",
      contentId: null,
    });
  });

  it("lets stronger classification replace values and weaker classification only fill compatible gaps", () => {
    const urlVideo = classification({
      platform: "youtube",
      contentType: "video",
      contentId: YOUTUBE_ID,
    });
    const liveVideo = classification({
      platform: "youtube",
      contentType: "video",
      orientation: "horizontal",
      contentId: YOUTUBE_ID,
      classificationSource: "extension-live-dom",
    });
    expect(mergeClassification(urlVideo, liveVideo)).toEqual(liveVideo);
    expect(mergeClassification(liveVideo, urlVideo)).toEqual(liveVideo);
    expect(
      mergeClassification(
        classification({ classificationSource: "extension-live-dom" }),
        urlVideo,
      ),
    ).toMatchObject({ platform: "website", contentId: null });
  });

  it("merges preview provenance independently in both directions", () => {
    const fallback = createFallbackPreview("https://example.com/a-story");
    const staticPreview = mergePreview(fallback, {
      source: "server-static-fetch",
      title: "Observed title",
      author: "Writer",
    });
    expect(staticPreview).toMatchObject({
      title: "Observed title",
      author: "Writer",
      previewSource: "server-static-fetch",
    });
    expect(
      mergePreview(staticPreview, {
        source: "url",
        title: "Weaker title",
        description: "Fill a missing value",
      }),
    ).toMatchObject({
      title: "Observed title",
      description: "Fill a missing value",
      previewSource: "server-static-fetch",
    });
    expect(
      mergePreview(staticPreview, {
        source: "extension-live-dom",
        title: "Live title",
      }),
    ).toMatchObject({
      title: "Live title",
      previewSource: "extension-live-dom",
    });
  });

  it("only creates the reliable YouTube thumbnail for a valid ID", () => {
    expect(youtubeThumbnailUrl(YOUTUBE_ID)).toContain(YOUTUBE_ID);
    expect(youtubeThumbnailUrl("invalid")).toBeNull();
  });
});
