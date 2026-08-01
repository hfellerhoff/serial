import { beforeEach, describe, expect, it } from "vitest";
import type { ApplicationFeedItem } from "~/server/db/schema";
import {
  applyOptimisticWatchedValue,
  applyOptimisticWatchedValues,
  resolveOptimisticWatchedValue,
  rollbackOptimisticWatchedValue,
  rollbackOptimisticWatchedValues,
  settleOptimisticWatchedValues,
} from "~/lib/data/feed-items/mutations";
import { feedItemsStore } from "~/lib/data/store";

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
    postedAt: new Date("2026-01-01T00:00:00Z"),
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    isWatchedUpdatedAt: null,
    isWatchLaterUpdatedAt: null,
    contentHash: "hash-1",
    platform: "website",
    ...overrides,
  };
}

describe("optimistic feed item mutations", () => {
  beforeEach(() => {
    feedItemsStore.getState().reset();
  });

  it("rolls back a failed optimistic update without changing updatedAt", () => {
    const previousFeedItem = makeItem();
    feedItemsStore
      .getState()
      .setFeedItem(previousFeedItem.id, previousFeedItem);
    const context = applyOptimisticWatchedValue(previousFeedItem.id, true);

    rollbackOptimisticWatchedValue(context);

    const rolledBackItem =
      feedItemsStore.getState().feedItemsDict[previousFeedItem.id];
    expect(rolledBackItem?.isWatched).toBe(false);
    expect(rolledBackItem?.updatedAt).toBe(previousFeedItem.updatedAt);
  });

  it("does not roll an older failure over a newer optimistic update", () => {
    const previousFeedItem = makeItem();
    feedItemsStore
      .getState()
      .setFeedItem(previousFeedItem.id, previousFeedItem);
    const failedContext = applyOptimisticWatchedValue(
      previousFeedItem.id,
      true,
    );
    applyOptimisticWatchedValue(previousFeedItem.id, false);

    rollbackOptimisticWatchedValue(failedContext);

    expect(
      feedItemsStore.getState().feedItemsDict[previousFeedItem.id]?.isWatched,
    ).toBe(false);
  });

  it("accepts the successful mutation response as authoritative", () => {
    const previousFeedItem = makeItem();
    const serverUpdatedAt = new Date("2025-12-31T00:00:00Z");
    feedItemsStore
      .getState()
      .setFeedItem(previousFeedItem.id, previousFeedItem);
    const context = applyOptimisticWatchedValue(previousFeedItem.id, true);

    resolveOptimisticWatchedValue(context, {
      isWatched: true,
      isWatchedUpdatedAt: serverUpdatedAt,
      updatedAt: serverUpdatedAt,
    });

    const resolvedItem =
      feedItemsStore.getState().feedItemsDict[previousFeedItem.id];
    expect(resolvedItem?.isWatched).toBe(true);
    expect(resolvedItem?.updatedAt).toBe(serverUpdatedAt);
  });

  it("applies and settles bulk updates with one store notification per phase", () => {
    const items = Array.from({ length: 100 }, (_, index) =>
      makeItem({ id: `item-${index}` }),
    );
    feedItemsStore.getState().setFeedItems(items);
    let notifications = 0;
    const unsubscribe = feedItemsStore.subscribe(() => notifications++);

    const contexts = applyOptimisticWatchedValues(items, true);
    expect(notifications).toBe(1);
    expect(contexts).toHaveLength(100);

    settleOptimisticWatchedValues(
      contexts,
      items.map((item) => ({
        id: item.id,
        isWatched: true,
        isWatchedUpdatedAt: new Date("2026-01-02T00:00:00Z"),
        updatedAt: new Date("2026-01-02T00:00:00Z"),
      })),
    );
    expect(notifications).toBe(2);
    expect(
      Object.values(feedItemsStore.getState().feedItemsDict).every(
        (item) => item.isWatched,
      ),
    ).toBe(true);
    unsubscribe();
  });

  it("rolls a failed bulk update back with one store notification", () => {
    const items = Array.from({ length: 100 }, (_, index) =>
      makeItem({ id: `item-${index}` }),
    );
    feedItemsStore.getState().setFeedItems(items);
    const contexts = applyOptimisticWatchedValues(items, true);
    let notifications = 0;
    const unsubscribe = feedItemsStore.subscribe(() => notifications++);

    rollbackOptimisticWatchedValues(contexts);

    expect(notifications).toBe(1);
    expect(
      Object.values(feedItemsStore.getState().feedItemsDict).every(
        (item) => !item.isWatched,
      ),
    ).toBe(true);
    unsubscribe();
  });

  it("keeps missing and empty optimistic batches notification-free", () => {
    let notifications = 0;
    const unsubscribe = feedItemsStore.subscribe(() => notifications++);

    expect(applyOptimisticWatchedValues([], true)).toEqual([]);
    rollbackOptimisticWatchedValue(undefined);
    rollbackOptimisticWatchedValues([]);

    expect(notifications).toBe(0);
    unsubscribe();
  });
});
