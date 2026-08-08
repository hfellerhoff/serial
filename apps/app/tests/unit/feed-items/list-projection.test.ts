import { beforeEach, describe, expect, it } from "vitest";
import type { ApplicationFeedItem, ApplicationView } from "~/server/db/schema";
import {
  createFeedItemFilterIndex,
  createFeedItemFilterPredicate,
  hasFeedItemListProjectionChanged,
} from "~/lib/data/feed-items";
import { feedCategoriesStore } from "~/lib/data/feed-categories/store";
import { feedItemsStore, getFeedItemScopeKey } from "~/lib/data/store";
import { viewsStore } from "~/lib/data/views/store";

const FIXTURE_TIME = new Date("2026-01-15T12:00:00.000Z");

function makeItem(
  id: string,
  overrides: Partial<ApplicationFeedItem> = {},
): ApplicationFeedItem {
  return {
    id,
    feedId: 1,
    contentId: id,
    title: `Item ${id}`,
    author: "Serial",
    url: `https://serial.test/${id}`,
    thumbnail: "",
    content: "Original content",
    contentSnippet: "Original snippet",
    contentType: "text",
    isWatched: false,
    isWatchLater: false,
    progress: 0,
    duration: 100,
    orientation: null,
    platform: "website",
    postedAt: FIXTURE_TIME,
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME,
    isWatchedUpdatedAt: null,
    isWatchLaterUpdatedAt: null,
    contentHash: "hash-1",
    ...overrides,
  };
}

function makeView(
  id: number,
  overrides: Partial<ApplicationView> = {},
): ApplicationView {
  return {
    id,
    userId: "user-1",
    name: `View ${id}`,
    daysWindow: 0,
    readStatus: 0,
    contentFilter: 7,
    layout: "list",
    placement: id,
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME,
    isDefault: false,
    categoryIds: [],
    feedIds: [],
    viewSections: [],
    ...overrides,
  };
}

describe("Feed-item list projection", () => {
  beforeEach(() => {
    const view = makeView(10, { categoryIds: [100] });
    viewsStore.setState({
      views: [view],
      viewsDict: { [view.id]: view },
      fetchStatus: "success",
    });
    feedCategoriesStore.setState({
      feedCategories: [{ feedId: 1, categoryId: 100 }],
      feedCategoriesDict: {
        "1-100": { feedId: 1, categoryId: 100 },
      },
      fetchStatus: "success",
    });

    const item = makeItem("item-1");
    feedItemsStore.setState({
      feedItemsDict: { [item.id]: item },
      feedItemsOrder: [item.id],
      feedItemProjectionRevision: 0,
      scopeFeedItemIds: {
        [getFeedItemScopeKey("view", view.id, "unread")]: [item.id],
        [getFeedItemScopeKey("view", view.id, "read")]: [],
      },
    });
  });

  it("classifies progress and full-text patches as list-neutral", () => {
    const item = feedItemsStore.getState().feedItemsDict["item-1"]!;
    const listNeutralPatch: ApplicationFeedItem = {
      ...item,
      progress: 40,
      duration: 120,
      content: "Updated content",
      contentSnippet: "Updated snippet",
    };

    expect(hasFeedItemListProjectionChanged(item, listNeutralPatch)).toBe(
      false,
    );
    expect(
      hasFeedItemListProjectionChanged(item, {
        ...item,
        isWatched: true,
        isWatchedUpdatedAt: new Date(FIXTURE_TIME.getTime() + 1),
      }),
    ).toBe(true);
    expect(
      hasFeedItemListProjectionChanged(item, {
        ...item,
        isWatchLaterUpdatedAt: new Date(FIXTURE_TIME.getTime() + 1),
      }),
    ).toBe(true);
    expect(
      hasFeedItemListProjectionChanged(item, {
        ...item,
        url: "https://serial.test/changed",
      }),
    ).toBe(true);
  });

  it("patches one entity without publishing list or scope changes", () => {
    const stateBefore = feedItemsStore.getState();
    const dictionaryBefore = stateBefore.feedItemsDict;
    const scopesBefore = stateBefore.scopeFeedItemIds;
    const itemBefore = stateBefore.feedItemsDict["item-1"]!;

    stateBefore.setFeedItem(itemBefore.id, {
      ...itemBefore,
      progress: 50,
      content: "Updated content",
    });

    const stateAfter = feedItemsStore.getState();
    expect(stateAfter.feedItemsDict).toBe(dictionaryBefore);
    expect(stateAfter.feedItemsDict[itemBefore.id]).not.toBe(itemBefore);
    expect(stateAfter.feedItemsDict[itemBefore.id]?.progress).toBe(50);
    expect(stateAfter.feedItemProjectionRevision).toBe(0);
    expect(stateAfter.scopeFeedItemIds).toBe(scopesBefore);
  });

  it("keeps a 100-item state burst entity-local", () => {
    const items = Array.from({ length: 100 }, (_, index) =>
      makeItem(`item-${index}`),
    );
    feedItemsStore.setState({
      feedItemsDict: Object.fromEntries(items.map((item) => [item.id, item])),
      feedItemsOrder: items.map((item) => item.id),
      feedItemProjectionRevision: 0,
    });
    const dictionary = feedItemsStore.getState().feedItemsDict;
    const scopes = feedItemsStore.getState().scopeFeedItemIds;

    for (const item of items) {
      feedItemsStore.getState().setFeedItem(item.id, {
        ...item,
        progress: item.progress + 1,
      });
    }

    const state = feedItemsStore.getState();
    expect(state.feedItemsDict).toBe(dictionary);
    expect(state.feedItemProjectionRevision).toBe(0);
    expect(state.scopeFeedItemIds).toBe(scopes);
  });

  it("reconciles compiled View and visibility membership for relevant patches", () => {
    const item = feedItemsStore.getState().feedItemsDict["item-1"]!;
    feedItemsStore.getState().setFeedItem(item.id, {
      ...item,
      isWatched: true,
      isWatchedUpdatedAt: new Date(FIXTURE_TIME.getTime() + 1),
    });

    const state = feedItemsStore.getState();
    expect(state.feedItemProjectionRevision).toBe(1);
    expect(
      state.scopeFeedItemIds[getFeedItemScopeKey("view", 10, "unread")],
    ).toEqual([]);
    expect(
      state.scopeFeedItemIds[getFeedItemScopeKey("view", 10, "read")],
    ).toEqual([item.id]);
  });

  it("reuses one index across Feed, Tag, and View predicates", () => {
    const view = makeView(10, { categoryIds: [100] });
    const filterIndex = createFeedItemFilterIndex(
      [{ feedId: 1, categoryId: 100 }],
      [view],
    );
    const inView = createFeedItemFilterPredicate({
      visibilityFilter: "unread",
      categoryFilter: -1,
      feedFilter: -1,
      viewFilter: view,
      filterIndex,
      now: FIXTURE_TIME,
    });
    const inTag = createFeedItemFilterPredicate({
      visibilityFilter: "unread",
      categoryFilter: 100,
      feedFilter: -1,
      viewFilter: null,
      filterIndex,
      now: FIXTURE_TIME,
    });
    const inFeed = createFeedItemFilterPredicate({
      visibilityFilter: "unread",
      categoryFilter: -1,
      feedFilter: 1,
      viewFilter: null,
      filterIndex,
      now: FIXTURE_TIME,
    });
    const item = makeItem("indexed-item");

    expect(inView(item)).toBe(true);
    expect(inTag(item)).toBe(true);
    expect(inFeed(item)).toBe(true);
  });
});
