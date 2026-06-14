import { describe, expect, it } from "vitest";
import type { ApplicationFeedItem } from "~/server/db/schema";
import { mergeFeedItem } from "~/lib/data/feed-items/mergeFeedItem";

function makeItem(
  overrides: Partial<ApplicationFeedItem> = {},
): ApplicationFeedItem {
  return {
    id: "item-1",
    feedId: 1,
    contentId: "content-1",
    title: "Original title",
    author: "Original author",
    url: "https://example.com/original",
    thumbnail: "https://example.com/original.jpg",
    content: "Original content",
    contentSnippet: "Original snippet",
    isWatched: false,
    isWatchLater: false,
    progress: 0,
    duration: 0,
    orientation: "horizontal",
    postedAt: new Date("2026-01-01"),
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    isWatchedUpdatedAt: null,
    isWatchLaterUpdatedAt: null,
    contentHash: "hash-1",
    platform: "website",
    ...overrides,
  };
}

describe("mergeFeedItem", () => {
  it("preserves versioned item fields when the content hash matches", () => {
    const existingItem = makeItem();
    const incomingItem = makeItem({
      title: "Incoming title",
      content: "Incoming content",
      contentSnippet: "Incoming snippet",
      thumbnail: "https://example.com/incoming.jpg",
      isWatched: true,
      isWatchLater: true,
      isWatchedUpdatedAt: new Date("2026-01-02"),
      isWatchLaterUpdatedAt: new Date("2026-01-03"),
      progress: 42,
      duration: 100,
      updatedAt: new Date("2026-01-04"),
      contentHash: "hash-1",
    });

    const mergedItem = mergeFeedItem(existingItem, incomingItem);

    expect(mergedItem.title).toBe("Original title");
    expect(mergedItem.content).toBe("Original content");
    expect(mergedItem.contentSnippet).toBe("Original snippet");
    expect(mergedItem.thumbnail).toBe("https://example.com/original.jpg");
    expect(mergedItem.isWatched).toBe(true);
    expect(mergedItem.isWatchLater).toBe(true);
    expect(mergedItem.isWatchedUpdatedAt).toEqual(new Date("2026-01-02"));
    expect(mergedItem.isWatchLaterUpdatedAt).toEqual(new Date("2026-01-03"));
    expect(mergedItem.progress).toBe(42);
    expect(mergedItem.duration).toBe(100);
    expect(mergedItem.updatedAt).toEqual(new Date("2026-01-04"));
  });

  it("uses incoming versioned fields when the content hash changes", () => {
    const existingItem = makeItem();
    const incomingItem = makeItem({
      title: "Incoming title",
      content: "Incoming content",
      contentSnippet: "Incoming snippet",
      thumbnail: "https://example.com/incoming.jpg",
      contentHash: "hash-2",
    });

    const mergedItem = mergeFeedItem(existingItem, incomingItem);

    expect(mergedItem.title).toBe("Incoming title");
    expect(mergedItem.content).toBe("Incoming content");
    expect(mergedItem.contentSnippet).toBe("Incoming snippet");
    expect(mergedItem.thumbnail).toBe("https://example.com/incoming.jpg");
  });

  it("fills missing cached content when the hash matches", () => {
    const existingItem = makeItem({ content: "", contentSnippet: "" });
    const incomingItem = makeItem({ contentHash: "hash-1" });

    const mergedItem = mergeFeedItem(existingItem, incomingItem);

    expect(mergedItem.content).toBe("Original content");
    expect(mergedItem.contentSnippet).toBe("Original snippet");
  });
});
