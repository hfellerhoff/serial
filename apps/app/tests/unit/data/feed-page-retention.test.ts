import { afterEach, describe, expect, it } from "vitest";

import type { ApplicationFeedItem } from "~/server/db/schema";
import {
  clearRetainedEntityPins,
  setRetainedEntityPins,
} from "~/lib/data/page-retention";
import { feedItemsStore } from "~/lib/data/store";

const SCOPE_KEY = "view:7:unread";

function makeItem(pageIndex: number, itemIndex: number): ApplicationFeedItem {
  const id = `page-${pageIndex}-item-${itemIndex}`;
  const date = new Date(Date.UTC(2026, 0, 1, 0, pageIndex, itemIndex));
  return {
    id,
    feedId: 7,
    contentId: id,
    title: id,
    author: "Serial test",
    url: `https://example.com/${id}`,
    thumbnail: "",
    content: `<p>${id}</p>`,
    contentSnippet: id,
    contentType: "text",
    isWatched: false,
    isWatchLater: false,
    progress: 0,
    duration: 1,
    orientation: null,
    platform: "website",
    postedAt: date,
    createdAt: date,
    updatedAt: date,
    isWatchedUpdatedAt: null,
    isWatchLaterUpdatedAt: null,
    contentHash: id,
  };
}

function seedAndRetainPages(pageCount: number) {
  const items = Array.from({ length: pageCount }, (_page, pageIndex) =>
    Array.from({ length: 30 }, (_item, itemIndex) =>
      makeItem(pageIndex, itemIndex),
    ),
  );
  feedItemsStore.setState({
    feedItemsDict: Object.fromEntries(
      items.flat().map((item) => [item.id, item]),
    ),
    feedItemsOrder: items.flat().map((item) => item.id),
  });
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    feedItemsStore.getState().retainFeedItemPage({
      scopeKey: SCOPE_KEY,
      itemIds: items[pageIndex]!.map((item) => item.id),
      requestCursor: pageIndex === 0 ? null : { id: `cursor-${pageIndex - 1}` },
      nextCursor: { id: `cursor-${pageIndex}` },
      replacesScope: pageIndex === 0,
    });
  }
}

afterEach(() => {
  feedItemsStore.getState().reset();
  clearRetainedEntityPins("reader:test");
});

describe("Feed-item page retention", () => {
  it("plateaus pages, entities, scope references, and retained bytes", () => {
    seedAndRetainPages(12);

    const state = feedItemsStore.getState();
    expect(state.retainedFeedPages[SCOPE_KEY]).toHaveLength(8);
    expect(state.scopeFeedItemIds[SCOPE_KEY]).toHaveLength(240);
    expect(Object.keys(state.feedItemsDict)).toHaveLength(240);
    expect(state.retainedFeedPageBytes).toBeGreaterThan(0);
    expect(state.scopeFeedItemIds[SCOPE_KEY]).not.toContain("page-0-item-0");
    expect(state.scopeFeedItemIds[SCOPE_KEY]).toContain("page-11-item-29");
  });

  it("does not collect an entity pinned by an open reader", () => {
    setRetainedEntityPins("reader:test", {
      feedItemIds: ["page-0-item-0"],
    });

    seedAndRetainPages(12);

    const state = feedItemsStore.getState();
    expect(state.retainedFeedPages[SCOPE_KEY]).toHaveLength(8);
    expect(state.feedItemsDict["page-0-item-0"]).toBeDefined();
    expect(state.feedItemsDict["page-1-item-0"]).toBeUndefined();
  });
});
