import { describe, expect, it } from "vitest";

import { SQLiteAsyncDialect } from "drizzle-orm/sqlite-core";
import type {
  ApplicationFeedItem,
  ApplicationView,
  DatabaseFeed,
  DatabaseFeedCategory,
  FeedPlatform,
} from "~/server/db/schema";
import { doesFeedItemPassFilters } from "~/lib/data/feed-items";
import {
  buildViewCategoryFilter,
  isFeedCompatibleWithContentType,
} from "~/lib/data/feed-items/filters";
import { INBOX_VIEW_ID } from "~/lib/data/views/constants";

// ---------- buildViewCategoryFilter (server) ----------

// Drizzle SQL fragments are opaque, so we serialize them with the SQLite
// dialect to assert the resulting parameter list. This exercises the same
// partial-inclusion logic on the server-side query builder.

// ---------- fixture builders ----------

let nextItemId = 1;
function makeItem(
  feedId: number,
  platform: FeedPlatform = "website",
  overrides: Partial<ApplicationFeedItem> = {},
): ApplicationFeedItem {
  return {
    id: `item-${nextItemId++}`,
    feedId,
    platform,
    contentId: "c",
    title: "t",
    author: "a",
    url: "https://example.com",
    thumbnail: "",
    content: "",
    contentSnippet: "",
    isWatched: false,
    isWatchLater: false,
    progress: 0,
    duration: 0,
    orientation: "horizontal",
    postedAt: new Date("2026-01-01"),
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    contentHash: null,
    ...overrides,
  } as ApplicationFeedItem;
}

function makeFeed(
  id: number,
  platform: FeedPlatform = "website",
): DatabaseFeed {
  return {
    id,
    userId: "user-1",
    url: `https://example.com/${id}`,
    title: `feed-${id}`,
    description: "",
    image: "",
    platform,
    isActive: true,
    openLocation: "serial",
    nextFetchAt: new Date(),
    lastFetchedAt: null,
    etag: null,
    lastModified: null,
    failureCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as DatabaseFeed;
}

function makeView(
  id: number,
  opts: {
    categoryIds?: number[];
    feedIds?: number[];
    contentType?: ApplicationView["contentType"];
  } = {},
): ApplicationView {
  return {
    id,
    userId: "user-1",
    name: `view-${id}`,
    daysWindow: 0,
    readStatus: 0,
    orientation: "horizontal",
    contentType: opts.contentType ?? "all",
    layout: "list",
    placement: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    categoryIds: opts.categoryIds ?? [],
    feedIds: opts.feedIds ?? [],
    isDefault: false,
  } as unknown as ApplicationView;
}

const inboxView = makeView(INBOX_VIEW_ID);

function customViewFeedIdsFor(views: ApplicationView[]): Set<number> {
  return new Set(views.flatMap((v) => v.feedIds));
}

function customViewCategoryIdsFor(views: ApplicationView[]): Set<number> {
  return new Set(views.flatMap((v) => v.categoryIds));
}

// Convenience wrapper that supplies sensible defaults for the production
// filter. Callers may still pass `feeds` for fixture clarity (e.g. to make
// the test setup self-documenting), but the production filter no longer
// reads it, so the wrapper accepts and ignores it.
function passes(
  item: ApplicationFeedItem,
  viewFilter: ApplicationView | null,
  opts: {
    feeds?: DatabaseFeed[];
    feedCategories?: DatabaseFeedCategory[];
    customViews?: ApplicationView[];
  } = {},
): boolean {
  const feedCategories = opts.feedCategories ?? [];
  const customViews = opts.customViews;
  const customViewCategoryIds = customViews
    ? customViewCategoryIdsFor(customViews)
    : undefined;
  const customViewFeedIds = customViews
    ? customViewFeedIdsFor(customViews)
    : undefined;

  return doesFeedItemPassFilters({
    item,
    visibilityFilter: "unread",
    categoryFilter: -1,
    feedCategories,
    feedFilter: -1,
    viewFilter,
    customViewCategoryIds,
    customViews,
    softReadItemIds: undefined,
    customViewFeedIds,
  });
}

// ---------- isFeedCompatibleWithContentType ----------

describe("isFeedCompatibleWithContentType", () => {
  it("'all' is compatible with every platform", () => {
    expect(isFeedCompatibleWithContentType("youtube", "all")).toBe(true);
    expect(isFeedCompatibleWithContentType("website", "all")).toBe(true);
    expect(isFeedCompatibleWithContentType("nebula", "all")).toBe(true);
  });

  it("'longform' is compatible with every platform (filtering happens per-item)", () => {
    expect(isFeedCompatibleWithContentType("youtube", "longform")).toBe(true);
    expect(isFeedCompatibleWithContentType("website", "longform")).toBe(true);
  });

  it("'horizontal-video' only allows video platforms", () => {
    expect(isFeedCompatibleWithContentType("youtube", "horizontal-video")).toBe(
      true,
    );
    expect(
      isFeedCompatibleWithContentType("peertube", "horizontal-video"),
    ).toBe(true);
    expect(isFeedCompatibleWithContentType("nebula", "horizontal-video")).toBe(
      true,
    );
    expect(isFeedCompatibleWithContentType("website", "horizontal-video")).toBe(
      false,
    );
  });

  it("'vertical-video' only allows video platforms", () => {
    expect(isFeedCompatibleWithContentType("youtube", "vertical-video")).toBe(
      true,
    );
    expect(isFeedCompatibleWithContentType("website", "vertical-video")).toBe(
      false,
    );
  });

  it("undefined content type defaults to compatible", () => {
    expect(isFeedCompatibleWithContentType("website", undefined)).toBe(true);
  });
});

// ---------- doesFeedItemPassFilters: Inbox view ----------

describe("doesFeedItemPassFilters – Inbox view", () => {
  it("includes a feed with no categories and no direct view assignment", () => {
    const feed = makeFeed(1);
    const item = makeItem(1);
    expect(
      passes(item, inboxView, {
        feeds: [feed],
        feedCategories: [],
        customViews: [],
      }),
    ).toBe(true);
  });

  it("excludes a feed whose category is in a compatible custom view", () => {
    const feed = makeFeed(1, "youtube");
    const item = makeItem(1, "youtube");
    const view = makeView(10, { categoryIds: [100], contentType: "all" });

    expect(
      passes(item, inboxView, {
        feeds: [feed],
        feedCategories: [{ feedId: 1, categoryId: 100 }],
        customViews: [view],
      }),
    ).toBe(false);
  });

  // NOTE: There is a pre-existing limitation (not introduced by this PR) where
  // a feed whose only category is assigned to an *incompatible* custom view is
  // orphaned from both that view and Inbox. The Inbox-exclusion logic correctly
  // avoids adding such feeds to its exclusion set, but the synthetic Inbox view
  // doesn't carry that category in its `categoryIds` either, so the regular view
  // filter then drops the feed. The direct-assignment fix below (#2) does NOT
  // change this — it's tracked separately.
  it("orphans a feed whose only category is in an incompatible custom view (pre-existing limitation)", () => {
    const feed = makeFeed(1, "website");
    const item = makeItem(1, "website");
    const customView = makeView(10, {
      categoryIds: [100],
      contentType: "horizontal-video",
    });
    // Realistic Inbox: carries the set of "uncategorized" category ids,
    // i.e. categories NOT assigned to any custom view. Category 100 is in
    // customView, so it's NOT in Inbox's categoryIds.
    const realisticInbox = makeView(INBOX_VIEW_ID, { categoryIds: [200] });

    expect(
      passes(item, realisticInbox, {
        feeds: [feed],
        feedCategories: [{ feedId: 1, categoryId: 100 }],
        customViews: [customView],
      }),
    ).toBe(false);
  });

  it("excludes a feed directly assigned to a compatible custom view", () => {
    const feed = makeFeed(1, "youtube");
    const item = makeItem(1, "youtube");
    const view = makeView(10, { feedIds: [1], contentType: "all" });

    expect(
      passes(item, inboxView, {
        feeds: [feed],
        feedCategories: [],
        customViews: [view],
      }),
    ).toBe(false);
  });

  it("INCLUDES a feed directly assigned to an incompatible custom view (regression: #2)", () => {
    // The bug: a website feed directly assigned to a "vertical-video" view was
    // hidden from Inbox AND filtered out of the video view, orphaning items.
    const feed = makeFeed(1, "website");
    const item = makeItem(1, "website");
    const view = makeView(10, {
      feedIds: [1],
      contentType: "vertical-video",
    });

    expect(
      passes(item, inboxView, {
        feeds: [feed],
        feedCategories: [],
        customViews: [view],
      }),
    ).toBe(true);
  });

  it("excludes a feed directly assigned to two views when at least one is compatible", () => {
    const feed = makeFeed(1, "youtube");
    const item = makeItem(1, "youtube");
    const incompatible = makeView(10, {
      feedIds: [1],
      contentType: "vertical-video",
    });
    const compatible = makeView(11, { feedIds: [1], contentType: "all" });

    expect(
      passes(item, inboxView, {
        feeds: [feed],
        feedCategories: [],
        customViews: [incompatible, compatible],
      }),
    ).toBe(false);
  });

  it("includes a feed directly assigned only to incompatible views", () => {
    const feed = makeFeed(1, "website");
    const item = makeItem(1, "website");
    const v1 = makeView(10, { feedIds: [1], contentType: "horizontal-video" });
    const v2 = makeView(11, { feedIds: [1], contentType: "vertical-video" });

    expect(
      passes(item, inboxView, {
        feeds: [feed],
        feedCategories: [],
        customViews: [v1, v2],
      }),
    ).toBe(true);
  });

  it("includes a feed whose category exists in a custom view but the feed has no item-level matches", () => {
    // Feed has a category, but that category isn't assigned to any custom view.
    const feed = makeFeed(1);
    const item = makeItem(1);
    const view = makeView(10, { categoryIds: [999] });

    expect(
      passes(item, inboxView, {
        feeds: [feed],
        feedCategories: [{ feedId: 1, categoryId: 100 }],
        customViews: [view],
      }),
    ).toBe(true);
  });
});

// ---------- doesFeedItemPassFilters: Custom view ----------

describe("doesFeedItemPassFilters – custom view", () => {
  it("includes a feed when matched only via category", () => {
    const feed = makeFeed(1);
    const item = makeItem(1);
    const view = makeView(10, { categoryIds: [100] });

    expect(
      passes(item, view, {
        feeds: [feed],
        feedCategories: [{ feedId: 1, categoryId: 100 }],
        customViews: [view],
      }),
    ).toBe(true);
  });

  it("includes a feed when matched only via direct assignment", () => {
    const feed = makeFeed(1);
    const item = makeItem(1);
    const view = makeView(10, { feedIds: [1] });

    expect(
      passes(item, view, {
        feeds: [feed],
        feedCategories: [],
        customViews: [view],
      }),
    ).toBe(true);
  });

  it("includes a feed matched via both category and direct assignment (no double-counting bugs)", () => {
    const feed = makeFeed(1);
    const item = makeItem(1);
    const view = makeView(10, { categoryIds: [100], feedIds: [1] });

    expect(
      passes(item, view, {
        feeds: [feed],
        feedCategories: [{ feedId: 1, categoryId: 100 }],
        customViews: [view],
      }),
    ).toBe(true);
  });

  it("excludes a feed not in any of the view's categories or feedIds", () => {
    const feed = makeFeed(2);
    const item = makeItem(2);
    const view = makeView(10, { categoryIds: [100], feedIds: [1] });

    expect(
      passes(item, view, {
        feeds: [feed],
        feedCategories: [{ feedId: 1, categoryId: 100 }],
        customViews: [view],
      }),
    ).toBe(false);
  });

  it("does not apply view filter when both categoryIds and feedIds are empty", () => {
    // An empty view filter is treated as "no filter" — the item passes regardless.
    const feed = makeFeed(1);
    const item = makeItem(1);
    const view = makeView(10);

    expect(
      passes(item, view, {
        feeds: [feed],
        feedCategories: [],
        customViews: [view],
      }),
    ).toBe(true);
  });

  it("excludes a feed via content-type filter even if it's directly assigned", () => {
    // Direct assignment doesn't bypass the content-type filter — the website
    // feed is assigned but the view only shows videos, so the item is filtered.
    const feed = makeFeed(1, "website");
    const item = makeItem(1, "website");
    const view = makeView(10, {
      feedIds: [1],
      contentType: "horizontal-video",
    });

    expect(
      passes(item, view, {
        feeds: [feed],
        feedCategories: [],
        customViews: [view],
      }),
    ).toBe(false);
  });
});

const dialect = new SQLiteAsyncDialect();

function paramsOf(sql: ReturnType<typeof buildViewCategoryFilter>): unknown[] {
  if (!sql) return [];
  return dialect.sqlToQuery(sql).params;
}

describe("buildViewCategoryFilter – server", () => {
  it("returns undefined when no view is selected", () => {
    expect(buildViewCategoryFilter(null, [], [])).toBeUndefined();
  });

  it("returns undefined when the view has no categories and no direct feeds", () => {
    const view = makeView(10);
    expect(buildViewCategoryFilter(view, [], [])).toBeUndefined();
  });

  it("includes feeds matched via the view's categories", () => {
    const view = makeView(10, { categoryIds: [100] });
    const sql = buildViewCategoryFilter(
      view,
      [{ feedId: 1, categoryId: 100 }],
      [1, 2, 3],
    );
    expect(paramsOf(sql)).toContain(1);
    expect(paramsOf(sql)).not.toContain(2);
  });

  it("includes feeds matched via direct assignment", () => {
    const view = makeView(10, { feedIds: [2] });
    const sql = buildViewCategoryFilter(view, [], [1, 2, 3]);
    expect(paramsOf(sql)).toContain(2);
    expect(paramsOf(sql)).not.toContain(1);
  });

  it("unions category and direct feed assignments without duplicates", () => {
    const view = makeView(10, { categoryIds: [100], feedIds: [1, 2] });
    const sql = buildViewCategoryFilter(
      view,
      [
        { feedId: 1, categoryId: 100 },
        { feedId: 3, categoryId: 100 },
      ],
      [1, 2, 3, 4],
    );
    const params = paramsOf(sql);
    // Should contain feeds 1, 2, 3 — and exactly once each.
    expect(params.filter((p) => p === 1)).toHaveLength(1);
    expect(params).toContain(2);
    expect(params).toContain(3);
    expect(params).not.toContain(4);
  });

  describe("Inbox view", () => {
    it("includes uncategorized feeds and excludes feeds visible in a compatible custom view", () => {
      const inbox = makeView(INBOX_VIEW_ID, { categoryIds: [200] });
      const customView = makeView(10, {
        categoryIds: [100],
        contentType: "all",
      });
      const feeds = [
        makeFeed(1, "youtube"), // categorized into custom view → excluded
        makeFeed(2, "website"), // uncategorized → included
        makeFeed(3, "website"), // categorized into inbox category → included
      ];
      const sql = buildViewCategoryFilter(
        inbox,
        [
          { feedId: 1, categoryId: 100 },
          { feedId: 3, categoryId: 200 },
        ],
        [1, 2, 3],
        new Set([100]),
        [customView],
        feeds,
      );
      const params = paramsOf(sql);
      expect(params).not.toContain(1);
      expect(params).toContain(2);
      expect(params).toContain(3);
    });

    it("excludes feeds directly assigned to a compatible custom view", () => {
      const inbox = makeView(INBOX_VIEW_ID, { categoryIds: [200] });
      const customView = makeView(10, { feedIds: [1], contentType: "all" });
      const feeds = [makeFeed(1, "youtube"), makeFeed(2, "website")];
      const sql = buildViewCategoryFilter(
        inbox,
        [],
        [1, 2],
        new Set(),
        [customView],
        feeds,
        new Set([1]),
      );
      const params = paramsOf(sql);
      expect(params).not.toContain(1);
      expect(params).toContain(2);
    });

    it("does NOT exclude feeds directly assigned to an incompatible custom view (regression: #2)", () => {
      // Website feed directly assigned to a video-only view should stay in Inbox.
      const inbox = makeView(INBOX_VIEW_ID, { categoryIds: [200] });
      const videoView = makeView(10, {
        feedIds: [1],
        contentType: "horizontal-video",
      });
      const feeds = [makeFeed(1, "website")];
      const sql = buildViewCategoryFilter(
        inbox,
        [],
        [1],
        new Set(),
        [videoView],
        feeds,
        new Set([1]),
      );
      expect(paramsOf(sql)).toContain(1);
    });

    it("excludes a directly-assigned feed when at least one assigning view is compatible", () => {
      const inbox = makeView(INBOX_VIEW_ID, { categoryIds: [200] });
      const incompatible = makeView(10, {
        feedIds: [1],
        contentType: "vertical-video",
      });
      const compatible = makeView(11, { feedIds: [1], contentType: "all" });
      const feeds = [makeFeed(1, "youtube")];
      const sql = buildViewCategoryFilter(
        inbox,
        [],
        [1],
        new Set(),
        [incompatible, compatible],
        feeds,
        new Set([1]),
      );
      expect(paramsOf(sql)).not.toContain(1);
    });
  });
});
