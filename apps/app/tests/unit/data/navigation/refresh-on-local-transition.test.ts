import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ApplicationFeedItem, ApplicationView } from "~/server/db/schema";
import { shouldRefreshNavigationAfterFeedItemChange } from "~/lib/data/navigation/refreshOnLocalTransition";
import { feedItemsStore, getFeedItemScopeKey } from "~/lib/data/store";
import { viewsStore } from "~/lib/data/views/store";

const NOW = new Date("2026-08-05T12:00:00.000Z");
const VIEW_ID = 10;

function makeView(): ApplicationView {
  return {
    id: VIEW_ID,
    userId: "user-one",
    name: "Reading",
    daysWindow: 0,
    readStatus: 0,
    contentFilter: 7,
    layout: "list",
    placement: 0,
    createdAt: NOW,
    updatedAt: NOW,
    categoryIds: [],
    feedIds: [1],
    isDefault: false,
    viewSections: [],
  };
}

function makeItem(isWatched: boolean): ApplicationFeedItem {
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
    contentType: "text",
    isWatched,
    isWatchLater: false,
    progress: 0,
    duration: 0,
    orientation: null,
    postedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    isWatchedUpdatedAt: isWatched ? NOW : null,
    isWatchLaterUpdatedAt: null,
    contentHash: null,
    platform: "website",
  };
}

beforeEach(() => {
  const view = makeView();
  viewsStore.getState().set([view]);
  viewsStore.getState().setViewAvailability({
    [VIEW_ID]: { unread: true, read: false, later: false },
  });
  feedItemsStore.getState().reset();
});

afterEach(() => {
  feedItemsStore.getState().reset();
  viewsStore.getState().reset();
});

describe("navigation refresh transitions", () => {
  it("refreshes when a full unread bucket loses its last local item", () => {
    const previousItem = makeItem(false);
    const nextItem = makeItem(true);
    feedItemsStore.getState().setFeedItems([nextItem]);
    feedItemsStore.setState({
      scopeFeedItemIds: {
        [getFeedItemScopeKey("view", VIEW_ID, "unread")]: [],
      },
    });

    expect(
      shouldRefreshNavigationAfterFeedItemChange({ previousItem, nextItem }),
    ).toBe(true);
  });

  it("refreshes when a dimmed unread bucket receives its first local item", () => {
    const previousItem = makeItem(true);
    const nextItem = makeItem(false);
    viewsStore.getState().setViewAvailability({
      [VIEW_ID]: { unread: false, read: true, later: false },
    });
    feedItemsStore.getState().setFeedItems([nextItem]);
    feedItemsStore.setState({
      scopeFeedItemIds: {
        [getFeedItemScopeKey("view", VIEW_ID, "read")]: [],
        [getFeedItemScopeKey("view", VIEW_ID, "unread")]: [nextItem.id],
      },
    });

    expect(
      shouldRefreshNavigationAfterFeedItemChange({ previousItem, nextItem }),
    ).toBe(true);
  });

  it("does not refresh when local content agrees with the chip state", () => {
    const previousItem = makeItem(false);
    const nextItem = makeItem(true);
    viewsStore.getState().setViewAvailability({
      [VIEW_ID]: { unread: true, read: true, later: false },
    });
    feedItemsStore.getState().setFeedItems([nextItem]);
    feedItemsStore.setState({
      scopeFeedItemIds: {
        [getFeedItemScopeKey("view", VIEW_ID, "unread")]: ["another-item"],
        [getFeedItemScopeKey("view", VIEW_ID, "read")]: [nextItem.id],
      },
    });

    expect(
      shouldRefreshNavigationAfterFeedItemChange({ previousItem, nextItem }),
    ).toBe(false);
  });

  it("refreshes when a saved bucket loses its last local item", () => {
    const previousItem = {
      ...makeItem(false),
      isWatchLater: true,
      isWatchLaterUpdatedAt: NOW,
    };
    const nextItem = { ...previousItem, isWatchLater: false };
    viewsStore.getState().setViewAvailability({
      [VIEW_ID]: { unread: true, read: false, later: true },
    });
    feedItemsStore.getState().setFeedItems([nextItem]);
    feedItemsStore.setState({
      scopeFeedItemIds: {
        [getFeedItemScopeKey("view", VIEW_ID, "later")]: [],
      },
    });

    expect(
      shouldRefreshNavigationAfterFeedItemChange({ previousItem, nextItem }),
    ).toBe(true);
  });
});
