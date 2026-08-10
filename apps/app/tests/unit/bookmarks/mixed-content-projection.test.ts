import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBookmarkTestDatabase } from "./database";
import type { MixedContentCursor } from "~/server/mixed-content/projection";
import { UNCATEGORIZED_VIEW_ID } from "~/lib/data/views/constants";
import {
  bookmarks,
  bookmarkTags,
  bookmarkViews,
  contentCategories,
  feedCategories,
  feedItems,
  feeds,
  pageCaptures,
  user,
  viewCategories,
  viewFeeds,
  views,
  viewSections,
} from "~/server/db/schema";
import { queryMixedContentPage } from "~/server/mixed-content/projection";
import { normalizedBookmarkUrlOverride } from "~/server/bookmarks/url";

type TestDatabase = Awaited<
  ReturnType<typeof createBookmarkTestDatabase>
>["database"];
type Cleanup = Awaited<
  ReturnType<typeof createBookmarkTestDatabase>
>["cleanup"];

let database: TestDatabase;
let cleanup: Cleanup;

const NOW = new Date("2026-07-30T12:00:00.000Z");

async function seedUser(id = "user-one") {
  await database.insert(user).values({
    id,
    name: id,
    email: `${id}@example.com`,
    emailVerified: true,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

async function seedFeed(
  id: number,
  overrides: Partial<typeof feeds.$inferInsert> = {},
) {
  await database.insert(feeds).values({
    id,
    userId: "user-one",
    name: `Feed ${id}`,
    url: `https://feeds.example/${id}.xml`,
    platform: "website",
    ...overrides,
  });
}

async function seedFeedItem(input: {
  id: string;
  feedId: number;
  url: string;
  postedAt?: Date;
  isWatched?: boolean;
  isWatchLater?: boolean;
  isWatchedUpdatedAt?: Date | null;
  isWatchLaterUpdatedAt?: Date | null;
}) {
  await database.insert(feedItems).values({
    id: input.id,
    feedId: input.feedId,
    contentId: input.id,
    title: input.id,
    author: "Author",
    url: input.url,
    normalizedUrl: normalizedBookmarkUrlOverride(input.url),
    postedAt: input.postedAt ?? NOW,
    createdAt: input.postedAt ?? NOW,
    updatedAt: NOW,
    orientation: "horizontal",
    isWatched: input.isWatched ?? false,
    isWatchLater: input.isWatchLater ?? false,
    isWatchedUpdatedAt: input.isWatchedUpdatedAt ?? null,
    isWatchLaterUpdatedAt: input.isWatchLaterUpdatedAt ?? null,
  });
}

async function seedBookmark(input: {
  id: string;
  canonicalUrl?: string;
  isSaved?: boolean;
  isRead?: boolean;
  createdAt?: Date;
  savedUpdatedAt?: Date;
  readUpdatedAt?: Date;
  userId?: string;
  effectiveUrl?: string;
  title?: string;
  author?: string;
}) {
  const canonicalUrl =
    input.canonicalUrl ?? `https://bookmarks.example/${input.id}`;
  await database.insert(bookmarks).values({
    id: input.id,
    userId: input.userId ?? "user-one",
    sourceUrl: canonicalUrl,
    canonicalUrl,
    effectiveUrl: input.effectiveUrl ?? canonicalUrl,
    title: input.title,
    author: input.author,
    isSaved: input.isSaved ?? true,
    isRead: input.isRead ?? false,
    createdAt: input.createdAt ?? NOW,
    savedUpdatedAt: input.savedUpdatedAt ?? NOW,
    readUpdatedAt: input.readUpdatedAt ?? NOW,
    progressUpdatedAt: NOW,
    updatedAt: NOW,
  });
}

async function seedView(id: number, name: string) {
  await database.insert(views).values({
    id,
    userId: "user-one",
    name,
    contentFilter: 3,
    layout: "list",
  });
}

beforeEach(async () => {
  ({ database, cleanup } = await createBookmarkTestDatabase());
  await seedUser();
});

afterEach(() => cleanup());

describe("mixed-content projection", () => {
  it("includes Feed items only through explicit View or Tag membership, including unfiltered Views", async () => {
    await seedFeed(1);
    await seedFeed(2);
    await seedFeedItem({
      id: "assigned-feed-item",
      feedId: 1,
      url: "https://feeds.example/assigned",
    });
    await seedFeedItem({
      id: "unassigned-feed-item",
      feedId: 2,
      url: "https://feeds.example/unassigned",
    });
    await seedView(10, "Assigned");
    await seedView(11, "Unfiltered but empty");
    await database.insert(viewFeeds).values({ viewId: 10, feedId: 1 });

    const assignedView = await queryMixedContentPage({
      database,
      userId: "user-one",
      scope: { type: "view", viewId: 10 },
      contentStatus: { saveStatus: "inbox", archiveStatus: "unread" },
      limit: 20,
    });
    expect(
      assignedView.references.map((reference) => reference.entityId),
    ).toEqual(["assigned-feed-item"]);

    const emptyView = await queryMixedContentPage({
      database,
      userId: "user-one",
      scope: { type: "view", viewId: 11 },
      contentStatus: { saveStatus: "inbox", archiveStatus: "unread" },
      limit: 20,
    });
    expect(emptyView.references).toEqual([]);

    const inbox = await queryMixedContentPage({
      database,
      userId: "user-one",
      scope: { type: "view", viewId: UNCATEGORIZED_VIEW_ID },
      contentStatus: { saveStatus: "inbox", archiveStatus: "unread" },
      limit: 20,
    });
    expect(inbox.references.map((reference) => reference.entityId)).toEqual([
      "unassigned-feed-item",
    ]);
  });

  it("includes Bookmarks only through explicit View or Tag membership, including unfiltered Views", async () => {
    await seedView(10, "Assigned");
    await seedView(11, "Unfiltered but empty");
    await seedBookmark({ id: "assigned" });
    await seedBookmark({ id: "unassigned" });
    await database
      .insert(bookmarkViews)
      .values({ bookmarkId: "assigned", viewId: 10 });

    const assignedView = await queryMixedContentPage({
      database,
      userId: "user-one",
      scope: { type: "view", viewId: 10 },
      contentStatus: { saveStatus: "saved", archiveStatus: "unread" },
      limit: 20,
    });
    expect(
      assignedView.references.map((reference) => reference.entityId),
    ).toEqual(["assigned"]);

    const emptyView = await queryMixedContentPage({
      database,
      userId: "user-one",
      scope: { type: "view", viewId: 11 },
      contentStatus: { saveStatus: "saved", archiveStatus: "unread" },
      limit: 20,
    });
    expect(emptyView.references).toEqual([]);

    const inbox = await queryMixedContentPage({
      database,
      userId: "user-one",
      scope: { type: "view", viewId: UNCATEGORIZED_VIEW_ID },
      contentStatus: { saveStatus: "saved", archiveStatus: "unread" },
      limit: 20,
    });
    expect(inbox.references.map((reference) => reference.entityId)).toEqual([
      "unassigned",
    ]);
  });

  it("keeps matching Bookmarks and Feed items as independent mixed rows", async () => {
    await seedFeed(1);
    await seedFeed(2);
    await seedView(10, "Feed view");
    await seedView(11, "Bookmark view");
    await database.insert(viewFeeds).values({ viewId: 10, feedId: 1 });
    await database.insert(viewFeeds).values({ viewId: 10, feedId: 2 });

    const canonicalUrl = "https://example.com/article";
    await seedFeedItem({
      id: "feed-match-one",
      feedId: 1,
      url: `${canonicalUrl}#feed-one`,
    });
    await seedFeedItem({
      id: "feed-match-two",
      feedId: 2,
      url: `${canonicalUrl}#feed-two`,
    });
    await seedFeedItem({
      id: "feed-other",
      feedId: 1,
      url: "https://example.com/other",
    });
    await seedBookmark({
      id: "bookmark-match",
      canonicalUrl,
      isSaved: false,
    });
    await database
      .insert(bookmarkViews)
      .values({ bookmarkId: "bookmark-match", viewId: 10 });

    const mixedFeedView = await queryMixedContentPage({
      database,
      userId: "user-one",
      scope: { type: "view", viewId: 10 },
      contentStatus: { saveStatus: "inbox", archiveStatus: "unread" },
      limit: 20,
    });
    expect(
      mixedFeedView.references.map((reference) => reference.entityId),
    ).toEqual(
      expect.arrayContaining([
        "bookmark-match",
        "feed-match-one",
        "feed-match-two",
        "feed-other",
      ]),
    );
    expect(mixedFeedView.references).toHaveLength(4);

    const feedOnlyItems = await database
      .select()
      .from(feedItems)
      .where(eq(feedItems.feedId, 1));
    expect(feedOnlyItems.map((item) => item.id).sort()).toEqual([
      "feed-match-one",
      "feed-other",
    ]);

    await database.delete(feeds).where(eq(feeds.id, 1));
    expect(await database.select().from(bookmarks)).toHaveLength(1);

    const beforeBookmarkDeletion = await queryMixedContentPage({
      database,
      userId: "user-one",
      scope: { type: "view", viewId: 10 },
      contentStatus: { saveStatus: "inbox", archiveStatus: "unread" },
      limit: 20,
    });
    expect(
      beforeBookmarkDeletion.references.map((reference) => reference.entityId),
    ).toEqual(expect.arrayContaining(["bookmark-match", "feed-match-two"]));

    await database.delete(bookmarks).where(eq(bookmarks.id, "bookmark-match"));

    const restored = await queryMixedContentPage({
      database,
      userId: "user-one",
      scope: { type: "view", viewId: 10 },
      contentStatus: { saveStatus: "inbox", archiveStatus: "unread" },
      limit: 20,
    });
    expect(restored.references.map((reference) => reference.entityId)).toEqual([
      "feed-match-two",
    ]);
  });

  it("uses Bookmark-owned Views and Tags, earliest ordered Tag sections, and Uncategorized membership", async () => {
    await seedFeed(1);
    await seedFeedItem({
      id: "tagged-feed",
      feedId: 1,
      url: "https://feeds.example/tagged",
      isWatchLater: true,
      isWatchLaterUpdatedAt: NOW,
    });
    await seedView(10, "Ordered");
    await database.insert(contentCategories).values([
      { id: 1, userId: "user-one", name: "First" },
      { id: 2, userId: "user-one", name: "Second" },
    ]);
    await database.insert(viewCategories).values([
      { viewId: 10, categoryId: 1 },
      { viewId: 10, categoryId: 2 },
    ]);
    await database.insert(viewSections).values([
      { viewId: 10, placement: 1, itemType: "tag", itemId: 1 },
      { viewId: 10, placement: 2, itemType: "tag", itemId: 2 },
    ]);
    await database.insert(feedCategories).values({ feedId: 1, categoryId: 2 });
    await seedBookmark({ id: "both-tags" });
    await seedBookmark({ id: "direct-only" });
    await seedBookmark({ id: "uncategorized" });
    await database.insert(bookmarkTags).values([
      { bookmarkId: "both-tags", tagId: 1 },
      { bookmarkId: "both-tags", tagId: 2 },
    ]);
    await database
      .insert(bookmarkViews)
      .values({ bookmarkId: "direct-only", viewId: 10 });

    const ordered = await queryMixedContentPage({
      database,
      userId: "user-one",
      scope: { type: "view", viewId: 10 },
      contentStatus: { saveStatus: "saved", archiveStatus: "unread" },
      limit: 20,
    });
    expect(
      ordered.references.map(({ entityId, sectionPlacement }) => ({
        entityId,
        sectionPlacement,
      })),
    ).toEqual([
      { entityId: "both-tags", sectionPlacement: 1 },
      { entityId: "tagged-feed", sectionPlacement: 2 },
      { entityId: "direct-only", sectionPlacement: 999_999 },
    ]);

    const uncategorized = await queryMixedContentPage({
      database,
      userId: "user-one",
      scope: { type: "view", viewId: UNCATEGORIZED_VIEW_ID },
      contentStatus: { saveStatus: "saved", archiveStatus: "unread" },
      limit: 20,
    });
    expect(
      uncategorized.references.map((reference) => reference.entityId),
    ).toEqual(["uncategorized"]);

    const tagScope = await queryMixedContentPage({
      database,
      userId: "user-one",
      scope: { type: "tag", tagId: 2 },
      contentStatus: { saveStatus: "saved", archiveStatus: "unread" },
      limit: 20,
    });
    expect(
      tagScope.references.map((reference) => reference.entityId).sort(),
    ).toEqual(["both-tags", "tagged-feed"]);

    await Promise.all([
      database
        .update(feedItems)
        .set({
          isWatchLater: false,
          isWatched: true,
          isWatchedUpdatedAt: NOW,
        })
        .where(eq(feedItems.id, "tagged-feed")),
      database
        .update(bookmarks)
        .set({ isSaved: false, isRead: true, readUpdatedAt: NOW })
        .where(eq(bookmarks.id, "both-tags")),
      database
        .update(bookmarks)
        .set({ isSaved: false, isRead: true, readUpdatedAt: NOW })
        .where(eq(bookmarks.id, "direct-only")),
    ]);
    const read = await queryMixedContentPage({
      database,
      userId: "user-one",
      scope: { type: "view", viewId: 10 },
      contentStatus: { saveStatus: "inbox", archiveStatus: "archived" },
      limit: 20,
    });
    expect(
      read.references.map(({ entityId, sectionPlacement }) => ({
        entityId,
        sectionPlacement,
      })),
    ).toEqual([
      { entityId: "both-tags", sectionPlacement: 1 },
      { entityId: "tagged-feed", sectionPlacement: 2 },
      { entityId: "direct-only", sectionPlacement: 999_999 },
    ]);
  });

  it("keeps a directly assigned Feed item after a Bookmark-only Tag section", async () => {
    await seedView(10, "Sectioned");
    await database.insert(contentCategories).values({
      id: 1,
      userId: "user-one",
      name: "Bookmark section",
    });
    await database.insert(viewCategories).values({
      viewId: 10,
      categoryId: 1,
    });
    await database.insert(viewSections).values({
      viewId: 10,
      placement: 1,
      itemType: "tag",
      itemId: 1,
    });
    await seedBookmark({ id: "section-bookmark" });
    await database.insert(bookmarkTags).values({
      bookmarkId: "section-bookmark",
      tagId: 1,
    });
    await seedFeed(1);
    await database.insert(viewFeeds).values({ viewId: 10, feedId: 1 });
    await seedFeedItem({
      id: "uncategorized-feed-item",
      feedId: 1,
      url: "https://example.com/uncategorized-feed-item",
      isWatchLater: true,
      isWatchLaterUpdatedAt: NOW,
    });

    const page = await queryMixedContentPage({
      database,
      userId: "user-one",
      scope: { type: "view", viewId: 10 },
      contentStatus: { saveStatus: "saved", archiveStatus: "unread" },
      limit: 20,
    });

    expect(
      page.references.map(({ entityId, sectionPlacement }) => ({
        entityId,
        sectionPlacement,
      })),
    ).toEqual([
      { entityId: "section-bookmark", sectionPlacement: 1 },
      { entityId: "uncategorized-feed-item", sectionPlacement: 999_999 },
    ]);
  });

  it("applies archive-then-save ordering to both entity kinds", async () => {
    await seedView(10, "Everything");
    await seedFeed(1);
    await database.insert(viewFeeds).values({ viewId: 10, feedId: 1 });
    await seedFeedItem({
      id: "recently-saved-old-feed",
      feedId: 1,
      url: "https://example.com/old",
      postedAt: new Date("2020-01-01T00:00:00Z"),
      isWatchLater: true,
      isWatchLaterUpdatedAt: new Date("2026-07-30T11:00:00Z"),
    });
    await seedFeedItem({
      id: "earlier-saved-new-feed",
      feedId: 1,
      url: "https://example.com/new",
      postedAt: new Date("2026-07-30T11:59:00Z"),
      isWatchLater: true,
      isWatchLaterUpdatedAt: new Date("2026-07-30T09:00:00Z"),
    });
    await seedBookmark({
      id: "saved-and-read",
      isSaved: true,
      isRead: true,
      savedUpdatedAt: new Date("2026-07-30T10:00:00Z"),
    });
    await database
      .insert(bookmarkViews)
      .values({ bookmarkId: "saved-and-read", viewId: 10 });
    await seedBookmark({ id: "unsaved-unread", isSaved: false, isRead: false });
    await database
      .insert(bookmarkViews)
      .values({ bookmarkId: "unsaved-unread", viewId: 10 });
    await seedBookmark({ id: "unsaved-read", isSaved: false, isRead: true });
    await database
      .insert(bookmarkViews)
      .values({ bookmarkId: "unsaved-read", viewId: 10 });

    const saved = await queryMixedContentPage({
      database,
      userId: "user-one",
      scope: { type: "view", viewId: 10 },
      contentStatus: { saveStatus: "saved", archiveStatus: "unread" },
      limit: 20,
    });
    expect(saved.references.map((reference) => reference.entityId)).toEqual([
      "recently-saved-old-feed",
      "earlier-saved-new-feed",
    ]);

    const archivedSaved = await queryMixedContentPage({
      database,
      userId: "user-one",
      scope: { type: "view", viewId: 10 },
      contentStatus: { saveStatus: "saved", archiveStatus: "archived" },
      sectionPlacement: null,
      limit: 20,
    });
    expect(
      archivedSaved.references.map((reference) => reference.entityId),
    ).toEqual(["saved-and-read"]);

    const unread = await queryMixedContentPage({
      database,
      userId: "user-one",
      scope: { type: "view", viewId: 10 },
      contentStatus: { saveStatus: "inbox", archiveStatus: "unread" },
      limit: 20,
    });
    expect(unread.references.map((reference) => reference.entityId)).toContain(
      "unsaved-unread",
    );
    expect(
      unread.references.map((reference) => reference.entityId),
    ).not.toContain("saved-and-read");

    const archived = await queryMixedContentPage({
      database,
      userId: "user-one",
      scope: { type: "view", viewId: 10 },
      contentStatus: { saveStatus: "inbox", archiveStatus: "archived" },
      limit: 20,
    });
    expect(archived.references.map((reference) => reference.entityId)).toEqual([
      "unsaved-read",
    ]);
  });

  it("applies Saved + Archived within an ordinary View section page", async () => {
    await seedView(10, "Sectioned Saved");
    await database.insert(contentCategories).values([
      { id: 1, userId: "user-one", name: "First" },
      { id: 2, userId: "user-one", name: "Second" },
    ]);
    await database.insert(viewCategories).values([
      { viewId: 10, categoryId: 1 },
      { viewId: 10, categoryId: 2 },
    ]);
    await database.insert(viewSections).values([
      { viewId: 10, placement: 1, itemType: "tag", itemId: 1 },
      { viewId: 10, placement: 2, itemType: "tag", itemId: 2 },
    ]);
    await seedBookmark({ id: "first-archived", isRead: true });
    await seedBookmark({ id: "second-archived", isRead: true });
    await seedBookmark({ id: "second-unread" });
    await database.insert(bookmarkTags).values([
      { bookmarkId: "first-archived", tagId: 1 },
      { bookmarkId: "second-archived", tagId: 2 },
      { bookmarkId: "second-unread", tagId: 2 },
    ]);

    const initialSaved = await queryMixedContentPage({
      database,
      userId: "user-one",
      scope: { type: "view", viewId: 10 },
      contentStatus: { saveStatus: "saved", archiveStatus: "unread" },
      limit: 20,
    });
    expect(
      initialSaved.references.map((reference) => reference.entityId),
    ).toEqual(["second-unread"]);

    const firstSectionArchived = await queryMixedContentPage({
      database,
      userId: "user-one",
      scope: { type: "view", viewId: 10 },
      contentStatus: { saveStatus: "saved", archiveStatus: "archived" },
      sectionPlacement: 1,
      limit: 20,
    });
    expect(
      firstSectionArchived.references.map((reference) => reference.entityId),
    ).toEqual(["first-archived"]);
  });

  it("paginates without duplicates or gaps across section, timestamp, kind, and id boundaries", async () => {
    await seedView(10, "Ordered");
    await database.insert(contentCategories).values({
      id: 1,
      userId: "user-one",
      name: "Section",
    });
    await database.insert(viewCategories).values({ viewId: 10, categoryId: 1 });
    await database.insert(viewSections).values({
      viewId: 10,
      placement: 1,
      itemType: "tag",
      itemId: 1,
    });
    await seedFeed(1);
    await database.insert(feedCategories).values({ feedId: 1, categoryId: 1 });
    await seedFeedItem({
      id: "feed-a",
      feedId: 1,
      url: "https://example.com/feed-a",
      isWatchLater: true,
      isWatchLaterUpdatedAt: NOW,
    });
    await seedFeedItem({
      id: "feed-b",
      feedId: 1,
      url: "https://example.com/feed-b",
      isWatchLater: true,
      isWatchLaterUpdatedAt: NOW,
    });
    for (const id of ["bookmark-a", "bookmark-b"]) {
      await seedBookmark({ id, savedUpdatedAt: NOW });
      await database.insert(bookmarkTags).values({ bookmarkId: id, tagId: 1 });
    }
    await seedBookmark({
      id: "bookmark-trailing",
      savedUpdatedAt: new Date("2026-07-30T11:00:00Z"),
    });
    await database
      .insert(bookmarkViews)
      .values({ bookmarkId: "bookmark-trailing", viewId: 10 });

    const fullPage = await queryMixedContentPage({
      database,
      userId: "user-one",
      scope: { type: "view", viewId: 10 },
      contentStatus: { saveStatus: "saved", archiveStatus: "unread" },
      limit: 20,
    });
    const expectedIds = fullPage.references.map(
      (reference) => reference.entityId,
    );
    const pagedIds: string[] = [];
    let cursor: MixedContentCursor = null;
    do {
      const page = await queryMixedContentPage({
        database,
        userId: "user-one",
        scope: { type: "view", viewId: 10 },
        contentStatus: { saveStatus: "saved", archiveStatus: "unread" },
        cursor,
        limit: 1,
      });
      pagedIds.push(...page.references.map((reference) => reference.entityId));
      cursor = page.cursor;
    } while (cursor);

    expect(pagedIds).toEqual(expectedIds);
    expect(new Set(pagedIds).size).toBe(pagedIds.length);
    expect(pagedIds).toHaveLength(5);
  });

  it("synchronizes capture metadata and isolates another user's canonical Bookmark", async () => {
    await seedUser("user-two");
    await seedView(10, "Everything");
    await seedFeed(1);
    await database.insert(viewFeeds).values({ viewId: 10, feedId: 1 });
    await seedFeedItem({
      id: "owned-feed",
      feedId: 1,
      url: "https://example.com/shared",
      isWatchLater: true,
      isWatchLaterUpdatedAt: NOW,
    });
    await seedBookmark({
      id: "foreign-bookmark",
      canonicalUrl: "https://example.com/shared",
      userId: "user-two",
    });
    await seedBookmark({
      id: "captured-bookmark",
      effectiveUrl: "https://bookmarks.example/captured-bookmark",
      title: "Captured",
      author: "Writer",
    });
    await database
      .insert(bookmarkViews)
      .values({ bookmarkId: "captured-bookmark", viewId: 10 });
    await database.insert(pageCaptures).values({
      bookmarkId: "captured-bookmark",
      contentHtml: "<p>Body</p>",
      contentHash: "hash",
      captureSource: "extension-live-dom",
      extractorVersion: "test",
      sanitizerPolicyVersion: 1,
      capturedAt: NOW,
    });

    const page = await queryMixedContentPage({
      database,
      userId: "user-one",
      scope: { type: "view", viewId: 10 },
      contentStatus: { saveStatus: "saved", archiveStatus: "unread" },
      limit: 20,
    });
    expect(page.feedItems.map((item) => item.id)).toContain("owned-feed");
    expect(page.bookmarks[0]).toMatchObject({
      id: "captured-bookmark",
      title: "Captured",
      author: "Writer",
      captureHash: "hash",
      capturedAt: NOW,
      viewIds: [10],
      tagIds: [],
    });
  });
});
