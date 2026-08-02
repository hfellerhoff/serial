import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBookmarkTestDatabase } from "../bookmarks/database";
import { INBOX_VIEW_ID } from "~/lib/data/views/constants";
import {
  bookmarks,
  bookmarkTags,
  contentCategories,
  feedCategories,
  feedItems,
  feeds,
  user,
  viewCategories,
  viewFeeds,
  views,
  viewSections,
} from "~/server/db/schema";
import { queryNavigationSnapshot } from "~/server/navigation/snapshot";

type TestDatabase = Awaited<
  ReturnType<typeof createBookmarkTestDatabase>
>["database"];
type Cleanup = Awaited<
  ReturnType<typeof createBookmarkTestDatabase>
>["cleanup"];

const NOW = new Date("2026-08-01T12:00:00.000Z");

let database: TestDatabase;
let cleanup: Cleanup;

async function seedFeed(id: number, isActive = true) {
  await database.insert(feeds).values({
    id,
    userId: "navigation-user",
    name: `Feed ${id}`,
    url: `https://feeds.example/${id}.xml`,
    platform: "website",
    isActive,
  });
}

async function seedFeedItem(input: {
  id: string;
  feedId: number;
  isWatched?: boolean;
  isWatchLater?: boolean;
  postedAt?: Date;
}) {
  await database.insert(feedItems).values({
    id: input.id,
    feedId: input.feedId,
    contentId: input.id,
    contentType: "text",
    title: input.id,
    author: "Author",
    url: `https://items.example/${input.id}`,
    postedAt: input.postedAt ?? NOW,
    createdAt: input.postedAt ?? NOW,
    updatedAt: NOW,
    isWatched: input.isWatched ?? false,
    isWatchLater: input.isWatchLater ?? false,
  });
}

beforeEach(async () => {
  ({ database, cleanup } = await createBookmarkTestDatabase());
  await database.insert(user).values({
    id: "navigation-user",
    name: "Navigation User",
    email: "navigation@example.com",
    emailVerified: true,
    createdAt: NOW,
    updatedAt: NOW,
  });
});

afterEach(() => cleanup());

describe("navigation snapshot", () => {
  it("reports complete View, Tag, global Feed, and per-View Feed availability without loading content pages", async () => {
    await Promise.all([
      seedFeed(1),
      seedFeed(2),
      seedFeed(3, false),
      seedFeed(4),
    ]);
    await Promise.all([
      seedFeedItem({ id: "unread-feed-item", feedId: 1 }),
      seedFeedItem({ id: "read-feed-item", feedId: 2, isWatched: true }),
      seedFeedItem({ id: "saved-feed-item", feedId: 3, isWatchLater: true }),
    ]);

    await database.insert(contentCategories).values([
      { id: 11, userId: "navigation-user", name: "Populated Tag" },
      { id: 12, userId: "navigation-user", name: "Empty Tag" },
    ]);
    await database.insert(feedCategories).values({ feedId: 2, categoryId: 11 });
    await database.insert(views).values([
      {
        id: 21,
        userId: "navigation-user",
        name: "Sectioned View",
        contentFilter: 3,
        daysWindow: 0,
        layout: "list",
      },
      {
        id: 22,
        userId: "navigation-user",
        name: "Empty View",
        contentFilter: 3,
        daysWindow: 0,
        layout: "list",
      },
    ]);
    await database.insert(viewCategories).values([
      { viewId: 21, categoryId: 11 },
      { viewId: 22, categoryId: 12 },
    ]);
    await database.insert(viewFeeds).values({ viewId: 21, feedId: 4 });
    await database.insert(viewSections).values({
      viewId: 21,
      placement: 0,
      itemType: "tag",
      itemId: 11,
    });

    await database.insert(bookmarks).values({
      id: "bookmark-only-content",
      userId: "navigation-user",
      sourceUrl: "https://bookmarks.example/only",
      canonicalUrl: "https://bookmarks.example/only",
      title: "Bookmark-only content",
      contentType: "text",
      isSaved: false,
      isRead: false,
      createdAt: NOW,
      savedUpdatedAt: NOW,
      readUpdatedAt: NOW,
      progressUpdatedAt: NOW,
      updatedAt: NOW,
    });
    await database.insert(bookmarkTags).values({
      bookmarkId: "bookmark-only-content",
      tagId: 11,
    });

    const snapshot = await queryNavigationSnapshot({
      database,
      userId: "navigation-user",
      now: NOW,
    });

    expect(snapshot.views[21]).toEqual({
      unread: true,
      read: true,
      later: false,
    });
    expect(snapshot.views[22]).toEqual({
      unread: false,
      read: false,
      later: false,
    });
    expect(snapshot.views[INBOX_VIEW_ID]).toEqual({
      unread: true,
      read: false,
      later: true,
    });
    expect(snapshot.tags[11]).toEqual({
      unread: true,
      read: true,
      later: false,
    });
    expect(snapshot.tags[12]).toEqual({
      unread: false,
      read: false,
      later: false,
    });
    expect(snapshot.feeds).toEqual({
      1: { unread: true, read: false, later: false },
      2: { unread: false, read: true, later: false },
      3: { unread: false, read: false, later: true },
      4: { unread: false, read: false, later: false },
    });
    expect(snapshot.viewFeeds[21]).toEqual({
      2: { unread: false, read: true, later: false },
      4: { unread: false, read: false, later: false },
    });
    expect(snapshot.viewFeeds[22]).toEqual({});
    expect(snapshot.viewFeeds[INBOX_VIEW_ID]).toEqual({
      1: { unread: true, read: false, later: false },
      3: { unread: false, read: false, later: true },
    });
  });

  it("applies each View's time and content filters while keeping Feed availability global", async () => {
    await seedFeed(1);
    await database.update(feeds).set({ platform: "youtube" });
    await database.insert(feedItems).values([
      {
        id: "old-text",
        feedId: 1,
        contentId: "old-text",
        contentType: "text",
        title: "Old text",
        author: "Author",
        url: "https://items.example/old-text",
        postedAt: new Date("2026-06-01T12:00:00.000Z"),
        createdAt: new Date("2026-06-01T12:00:00.000Z"),
        updatedAt: NOW,
      },
      {
        id: "current-video",
        feedId: 1,
        contentId: "current-video",
        contentType: "video",
        orientation: "horizontal",
        title: "Current video",
        author: "Author",
        url: "https://items.example/current-video",
        postedAt: NOW,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
    await database.insert(views).values({
      id: 30,
      userId: "navigation-user",
      name: "Recent text",
      contentFilter: 1,
      daysWindow: 7,
      layout: "list",
    });
    await database.insert(viewFeeds).values({ viewId: 30, feedId: 1 });

    const snapshot = await queryNavigationSnapshot({
      database,
      userId: "navigation-user",
      now: NOW,
    });

    expect(snapshot.views[30]?.unread).toBe(false);
    expect(snapshot.feeds[1]?.unread).toBe(true);
  });
});
