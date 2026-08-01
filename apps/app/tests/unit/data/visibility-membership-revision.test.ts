import { beforeEach, describe, expect, it } from "vitest";
import type { ApplicationFeedItem, ApplicationView } from "~/server/db/schema";
import type { PublishedChunk } from "~/server/api/publisher";
import { processPublishedChunks } from "~/lib/data/subscriptionCoordinator";
import {
  advanceFeedItemMembershipRevision,
  getFeedItemMembershipRevision,
} from "~/lib/data/feed-items/membershipRevision";
import { feedItemsStore, getFeedItemScopeKey } from "~/lib/data/store";
import { viewsStore } from "~/lib/data/views/store";

const NOW = new Date("2026-07-31T12:00:00.000Z");
const VIEW_ID = 10;

function makeView(): ApplicationView {
  return {
    id: VIEW_ID,
    userId: "user-one",
    name: "All",
    daysWindow: 0,
    readStatus: 0,
    orientation: "horizontal",
    contentType: "all",
    layout: "list",
    placement: 0,
    createdAt: NOW,
    updatedAt: NOW,
    categoryIds: [],
    feedIds: [],
    isDefault: false,
    viewSections: [],
  };
}

function makeItem(): ApplicationFeedItem {
  return {
    id: "item-one",
    feedId: 1,
    contentId: "content-one",
    title: "Article",
    author: "Writer",
    url: "https://example.com/article",
    thumbnail: "",
    content: "Article body",
    contentSnippet: "Article body",
    isWatched: false,
    isWatchLater: false,
    progress: 0,
    duration: 0,
    orientation: "horizontal",
    postedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    isWatchedUpdatedAt: null,
    isWatchLaterUpdatedAt: null,
    contentHash: null,
    platform: "website",
  };
}

function replacementPayload(membershipRevision: number): PublishedChunk {
  return {
    source: "visibility",
    chunk: {
      type: "view-diff",
      viewId: VIEW_ID,
      visibilityFilter: "unread",
      diff: [],
      cursor: null,
      hasMore: false,
      replacesScope: true,
      membershipRevision,
    },
  };
}

beforeEach(() => {
  feedItemsStore.getState().reset();
  viewsStore.getState().set([makeView()]);
});

describe("visibility membership revisions", () => {
  it("does not let a pre-mutation replacement erase restored membership", () => {
    const item = makeItem();
    const scopeKey = getFeedItemScopeKey("view", VIEW_ID, "unread");
    feedItemsStore.getState().setFeedItems([item]);
    feedItemsStore.setState({ scopeFeedItemIds: { [scopeKey]: [item.id] } });

    const requestRevision = getFeedItemMembershipRevision();
    advanceFeedItemMembershipRevision();
    processPublishedChunks([replacementPayload(requestRevision)]);

    expect(feedItemsStore.getState().scopeFeedItemIds[scopeKey]).toEqual([
      item.id,
    ]);
  });

  it("accepts a replacement from the current membership revision", () => {
    const item = makeItem();
    const scopeKey = getFeedItemScopeKey("view", VIEW_ID, "unread");
    feedItemsStore.getState().setFeedItems([item]);
    feedItemsStore.setState({ scopeFeedItemIds: { [scopeKey]: [item.id] } });

    processPublishedChunks([
      replacementPayload(getFeedItemMembershipRevision()),
    ]);

    expect(feedItemsStore.getState().scopeFeedItemIds[scopeKey]).toEqual([]);
  });
});
