import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApplicationFeedItem } from "~/server/db/schema";
import type { PublishedChunk } from "~/server/api/publisher";
import { navigationSnapshotStore } from "~/lib/data/navigation/store";
import { feedItemsStore } from "~/lib/data/store";
import { processPublishedChunks } from "~/lib/data/subscriptionCoordinator";

const NOW = new Date("2026-08-08T12:00:00.000Z");
const originalFetch = navigationSnapshotStore.getState().fetch;

function savedItem(isWatched: boolean): ApplicationFeedItem {
  return {
    id: "saved-item",
    feedId: 1,
    contentId: "saved-item",
    title: "Saved item",
    author: "Author",
    url: "https://example.com/saved-item",
    thumbnail: "",
    content: "",
    contentSnippet: "",
    contentType: "text",
    isWatched,
    isWatchLater: true,
    progress: 0,
    duration: 0,
    orientation: null,
    postedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    isWatchedUpdatedAt: NOW,
    isWatchLaterUpdatedAt: NOW,
    contentHash: null,
    platform: "website",
  };
}

function feedItemPayload(
  item: ApplicationFeedItem,
  refreshNavigationSnapshot = false,
): PublishedChunk {
  return {
    source: "initial",
    chunk: {
      type: "feed-items",
      feedId: item.feedId,
      feedItems: [item],
      refreshNavigationSnapshot,
    },
  };
}

beforeEach(() => {
  vi.stubGlobal("window", {});
  feedItemsStore.getState().reset();
});

afterEach(() => {
  navigationSnapshotStore.setState({ fetch: originalFetch });
  vi.unstubAllGlobals();
});

describe("feed item navigation snapshot revalidation", () => {
  it.each([
    { previousIsWatched: false, nextIsWatched: true },
    { previousIsWatched: true, nextIsWatched: false },
  ])(
    "revalidates when Saved unread membership changes from $previousIsWatched to $nextIsWatched",
    async ({ previousIsWatched, nextIsWatched }) => {
      feedItemsStore
        .getState()
        .setFeedItem("saved-item", savedItem(previousIsWatched));
      const fetch = vi.fn().mockResolvedValue(undefined);
      navigationSnapshotStore.setState({ fetch });

      processPublishedChunks([feedItemPayload(savedItem(nextIsWatched))]);

      await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    },
  );

  it("revalidates an optimistic mutation when its authoritative echo matches", async () => {
    const item = savedItem(false);
    feedItemsStore.getState().setFeedItem(item.id, item);
    const fetch = vi.fn().mockResolvedValue(undefined);
    navigationSnapshotStore.setState({ fetch });

    processPublishedChunks([feedItemPayload(item, true)]);

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  });
});
