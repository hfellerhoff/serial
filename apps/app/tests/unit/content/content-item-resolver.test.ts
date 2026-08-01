import { describe, expect, it } from "vitest";
import type { ApplicationFeedItem } from "~/server/db/schema";
import type { ApplicationBookmark } from "~/server/mixed-content/projection";
import {
  contentDestination,
  resolveContentItem,
  supportedContentRenderer,
} from "~/lib/data/content-items/resolver";

function feedItem(
  overrides: Partial<ApplicationFeedItem> = {},
): ApplicationFeedItem {
  return {
    id: "shared-id",
    platform: "website",
    contentType: "text",
    orientation: null,
    contentId: "feed-content",
    url: "https://example.com/feed",
    ...overrides,
  } as ApplicationFeedItem;
}

function bookmark(
  overrides: Partial<ApplicationBookmark> = {},
): ApplicationBookmark {
  return {
    id: "bookmark-id",
    platform: "website",
    contentType: "text",
    orientation: null,
    contentId: null,
    sourceUrl: "https://example.com/bookmark",
    captureHash: "hash",
    ...overrides,
  } as ApplicationBookmark;
}

describe("ContentItem resolver", () => {
  it("refuses an ambiguous entity ID", () => {
    expect(
      resolveContentItem({ feedItem: feedItem(), bookmark: bookmark() }),
    ).toEqual({ status: "ambiguous" });
  });

  it("resolves each persistence aggregate without merging them", () => {
    expect(resolveContentItem({ feedItem: feedItem() })).toMatchObject({
      status: "resolved",
      item: { entityKind: "feed-item" },
    });
    expect(resolveContentItem({ bookmark: bookmark() })).toMatchObject({
      status: "resolved",
      item: { entityKind: "bookmark" },
    });
    expect(resolveContentItem({})).toEqual({ status: "missing" });
  });

  it("routes native content and safely falls back to the original URL", () => {
    const reader = resolveContentItem({ bookmark: bookmark() });
    if (reader.status !== "resolved") throw new Error("Expected Bookmark");
    expect(contentDestination(reader.item)).toEqual({
      renderer: "read",
      href: "/read/bookmark-id",
      external: false,
    });

    const noCapture = resolveContentItem({
      bookmark: bookmark({ captureHash: null }),
    });
    if (noCapture.status !== "resolved") throw new Error("Expected Bookmark");
    expect(supportedContentRenderer(noCapture.item)).toBe("origin");

    const youtube = resolveContentItem({
      bookmark: bookmark({
        platform: "youtube",
        contentType: "video",
        contentId: "dQw4w9WgXcQ",
        captureHash: null,
      }),
    });
    if (youtube.status !== "resolved") throw new Error("Expected Bookmark");
    expect(supportedContentRenderer(youtube.item)).toBe("watch");

    const invalidPlayer = resolveContentItem({
      bookmark: bookmark({
        platform: "youtube",
        contentType: "video",
        contentId: "invalid",
        captureHash: null,
      }),
    });
    if (invalidPlayer.status !== "resolved") {
      throw new Error("Expected Bookmark");
    }
    expect(contentDestination(invalidPlayer.item)).toEqual({
      renderer: "origin",
      href: "https://example.com/bookmark",
      external: true,
      actionLabel: "View on YouTube",
    });
  });
});
