import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBookmarkTestDatabase } from "../bookmarks/database";
import { UNCATEGORIZED_VIEW_ID } from "~/lib/data/views/constants";
import {
  bookmarks,
  bookmarkTags,
  bookmarkViews,
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
  it("keeps Feed availability when a matching Bookmark has different status", async () => {
    await seedFeed(1);
    await database.insert(views).values({
      id: 20,
      userId: "navigation-user",
      name: "Independent rows",
      contentFilter: 3,
      daysWindow: 0,
      layout: "list",
    });
    await database.insert(viewFeeds).values({ viewId: 20, feedId: 1 });
    await database.insert(feedItems).values({
      id: "matching-feed-item",
      feedId: 1,
      contentId: "matching-feed-item",
      contentType: "text",
      title: "Matching Feed item",
      author: "Author",
      url: "https://items.example/shared",
      normalizedUrl: "https://items.example/shared",
      postedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
      isWatched: false,
      isWatchLater: false,
    });
    await database.insert(bookmarks).values({
      id: "matching-bookmark",
      userId: "navigation-user",
      sourceUrl: "https://items.example/shared",
      canonicalUrl: "https://items.example/shared",
      title: "Matching Bookmark",
      contentType: "text",
      isSaved: true,
      isRead: true,
      createdAt: NOW,
      savedUpdatedAt: NOW,
      readUpdatedAt: NOW,
      progressUpdatedAt: NOW,
      updatedAt: NOW,
    });

    const snapshot = await queryNavigationSnapshot({
      database,
      userId: "navigation-user",
      now: NOW,
    });

    expect(snapshot.views[20]?.inbox.unread).toBe(true);
    expect(snapshot.viewFeeds[20]?.[1]?.inbox.unread).toBe(true);
  });

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
      inbox: { unread: true, archived: true },
      saved: { unread: false, archived: false },
    });
    expect(snapshot.views[22]).toEqual({
      inbox: { unread: false, archived: false },
      saved: { unread: false, archived: false },
    });
    expect(snapshot.views[UNCATEGORIZED_VIEW_ID]).toEqual({
      inbox: { unread: true, archived: false },
      saved: { unread: true, archived: false },
    });
    expect(snapshot.tags[11]).toEqual({
      inbox: { unread: true, archived: true },
      saved: { unread: false, archived: false },
    });
    expect(snapshot.tags[12]).toEqual({
      inbox: { unread: false, archived: false },
      saved: { unread: false, archived: false },
    });
    expect(snapshot.feeds).toEqual({
      1: {
        inbox: { unread: true, archived: false },
        saved: { unread: false, archived: false },
      },
      2: {
        inbox: { unread: false, archived: true },
        saved: { unread: false, archived: false },
      },
      3: {
        inbox: { unread: false, archived: false },
        saved: { unread: true, archived: false },
      },
      4: {
        inbox: { unread: false, archived: false },
        saved: { unread: false, archived: false },
      },
    });
    expect(snapshot.viewFeeds[21]).toEqual({
      2: {
        inbox: { unread: false, archived: true },
        saved: { unread: false, archived: false },
      },
      4: {
        inbox: { unread: false, archived: false },
        saved: { unread: false, archived: false },
      },
    });
    expect(snapshot.viewFeeds[22]).toEqual({});
    expect(snapshot.viewFeeds[UNCATEGORIZED_VIEW_ID]).toEqual({
      1: {
        inbox: { unread: true, archived: false },
        saved: { unread: false, archived: false },
      },
      3: {
        inbox: { unread: false, archived: false },
        saved: { unread: true, archived: false },
      },
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

    expect(snapshot.views[30]?.inbox.unread).toBe(false);
    expect(snapshot.feeds[1]?.inbox.unread).toBe(true);
  });

  it("reports Saved availability independently for unread and archived content", async () => {
    await seedFeed(1);
    await database.insert(views).values({
      id: 31,
      userId: "navigation-user",
      name: "Saved availability",
      contentFilter: 3,
      daysWindow: 0,
      layout: "list",
    });
    await database.insert(viewFeeds).values({ viewId: 31, feedId: 1 });
    await seedFeedItem({
      id: "archived-saved-feed-item",
      feedId: 1,
      isWatched: true,
      isWatchLater: true,
    });
    await database.insert(bookmarks).values({
      id: "archived-saved-bookmark",
      userId: "navigation-user",
      sourceUrl: "https://bookmarks.example/archived-saved",
      canonicalUrl: "https://bookmarks.example/archived-saved",
      title: "Archived saved bookmark",
      contentType: "text",
      isSaved: true,
      isRead: true,
      createdAt: NOW,
      savedUpdatedAt: NOW,
      readUpdatedAt: NOW,
      progressUpdatedAt: NOW,
      updatedAt: NOW,
    });
    await database.insert(bookmarkViews).values({
      bookmarkId: "archived-saved-bookmark",
      viewId: 31,
    });

    let snapshot = await queryNavigationSnapshot({
      database,
      userId: "navigation-user",
      now: NOW,
    });

    expect(snapshot.views[31]?.saved).toEqual({
      unread: false,
      archived: true,
    });
    expect(snapshot.viewFeeds[31]?.[1]?.saved).toEqual({
      unread: false,
      archived: true,
    });

    await database
      .update(feedItems)
      .set({ isWatched: false })
      .where(eq(feedItems.id, "archived-saved-feed-item"));

    snapshot = await queryNavigationSnapshot({
      database,
      userId: "navigation-user",
      now: NOW,
    });

    expect(snapshot.views[31]?.saved).toEqual({
      unread: true,
      archived: true,
    });
    expect(snapshot.viewFeeds[31]?.[1]?.saved).toEqual({
      unread: true,
      archived: false,
    });

    await database
      .update(feedItems)
      .set({ isWatched: true })
      .where(eq(feedItems.id, "archived-saved-feed-item"));
    await database
      .update(bookmarks)
      .set({ isRead: false })
      .where(eq(bookmarks.id, "archived-saved-bookmark"));

    snapshot = await queryNavigationSnapshot({
      database,
      userId: "navigation-user",
      now: NOW,
    });

    expect(snapshot.views[31]?.saved).toEqual({
      unread: true,
      archived: true,
    });
    expect(snapshot.viewFeeds[31]?.[1]?.saved).toEqual({
      unread: false,
      archived: true,
    });
  });
});
