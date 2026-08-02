import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyMigrations,
  createLocalBenchmarkTarget,
  openBenchmarkDatabase,
} from "../../../scripts/performance/database";
import { updateBookmarksReadState } from "~/server/bookmarks/service";
import { loadExtensionBookmarkWorkspace } from "~/server/bookmarks/extensionWorkspace";
import { queryMixedContentPage } from "~/server/mixed-content/projection";
import { loadApplicationBookmark } from "~/server/mixed-content/sync";
import {
  bookmarks,
  bookmarkTags,
  contentCategories,
  feedCategories,
  feedItems,
  feeds,
  user,
  views,
} from "~/server/db/schema";

type Session = ReturnType<typeof openBenchmarkDatabase>;
type Target = ReturnType<typeof createLocalBenchmarkTarget>;

const NOW = new Date("2026-07-31T12:00:00.000Z");

let session: Session;
let target: Target;

beforeEach(async () => {
  target = createLocalBenchmarkTarget();
  session = openBenchmarkDatabase({ url: target.url });
  await applyMigrations(session.baseClient);
  await session.database.insert(user).values([
    {
      id: "bounds-user",
      name: "Bounds user",
      email: "bounds@example.com",
      emailVerified: true,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: "other-user",
      name: "Other user",
      email: "other-bounds@example.com",
      emailVerified: true,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]);
});

afterEach(() => {
  session.close();
  target.cleanup();
});

function bookmarkRows(count: number, userId = "bounds-user") {
  return Array.from({ length: count }, (_, index) => ({
    id: `${userId}-bookmark-${index.toString().padStart(4, "0")}`,
    userId,
    sourceUrl: `https://example.com/bookmark-${index}`,
    canonicalUrl: `https://example.com/bookmark-${index}`,
    savedUpdatedAt: new Date(NOW.getTime() - index),
    readUpdatedAt: new Date(NOW.getTime() - index),
    progressUpdatedAt: NOW,
    createdAt: new Date(NOW.getTime() - index),
    updatedAt: NOW,
  }));
}

describe("Bookmark server performance bounds", () => {
  it("returns the extension editor workspace without reloading its published Bookmark", async () => {
    const [row] = bookmarkRows(1);
    await session.database.insert(bookmarks).values(row!);
    await session.database.insert(views).values([
      { id: 1, userId: "bounds-user", name: "Reading" },
      { id: 2, userId: "bounds-user", name: "Research" },
    ]);
    await session.database.insert(contentCategories).values({
      id: 3,
      userId: "bounds-user",
      name: "Longform",
      createdAt: NOW,
      updatedAt: NOW,
    });
    const published = await loadApplicationBookmark({
      database: session.database,
      userId: "bounds-user",
      bookmarkId: row!.id,
    });
    expect(published).not.toBeNull();
    session.instrumentation.reset();

    const workspace = await loadExtensionBookmarkWorkspace({
      database: session.database,
      userId: "bounds-user",
      bookmarkId: row!.id,
      bookmark: published!,
    });
    const evidence = session.instrumentation.snapshot();

    expect(workspace).toMatchObject({
      bookmark: { id: row!.id },
      views: [{ id: 1 }, { id: 2 }],
      tags: [{ id: 3 }],
    });
    expect(evidence.statementCount).toBe(2);
    expect(evidence.materializedRows).toBe(3);
  });

  it("loads first, middle, missing, and wrong-owner Bookmarks as point queries", async () => {
    const rows = bookmarkRows(200);
    await session.database.insert(bookmarks).values(rows);
    await session.database
      .insert(bookmarks)
      .values(bookmarkRows(1, "other-user"));

    for (const [userId, bookmarkId, expectedId] of [
      ["bounds-user", rows[0]!.id, rows[0]!.id],
      ["bounds-user", rows[100]!.id, rows[100]!.id],
      ["bounds-user", "missing", null],
      ["bounds-user", "other-user-bookmark-0000", null],
    ] as const) {
      session.instrumentation.reset();
      const result = await loadApplicationBookmark({
        database: session.database,
        userId,
        bookmarkId,
      });
      const evidence = session.instrumentation.snapshot();
      expect(result?.id ?? null).toBe(expectedId);
      expect(evidence.statementCount).toBe(1);
      expect(evidence.materializedRows).toBe(expectedId ? 1 : 0);
    }
  });

  it("updates the maximum 500-Bookmark batch with one bounded statement", async () => {
    const rows = bookmarkRows(500);
    await session.database.insert(bookmarks).values(rows);
    session.instrumentation.reset();

    const updated = await updateBookmarksReadState({
      database: session.database,
      userId: "bounds-user",
      bookmarkIds: [...rows.map(({ id }) => id), rows[0]!.id],
      isRead: true,
    });
    const evidence = session.instrumentation.snapshot();

    expect(updated).toHaveLength(500);
    expect(evidence.statementCount).toBe(1);
    expect(evidence.materializedRows).toBe(500);
  });

  it("keeps first, cursor, and Tag pages bounded independently of library size", async () => {
    await session.database.insert(views).values({
      id: 10,
      userId: "bounds-user",
      name: "Everything",
      contentFilter: 7,
    });
    await session.database.insert(contentCategories).values({
      id: 20,
      userId: "bounds-user",
      name: "Research",
      createdAt: NOW,
      updatedAt: NOW,
    });
    await session.database.insert(feeds).values({
      id: 30,
      userId: "bounds-user",
      name: "Feed",
      url: "https://example.com/feed.xml",
      platform: "website",
    });
    await session.database.insert(feedCategories).values({
      feedId: 30,
      categoryId: 20,
    });
    await session.database.insert(feedItems).values(
      Array.from({ length: 1_000 }, (_, index) => ({
        id: `feed-item-${index.toString().padStart(4, "0")}`,
        feedId: 30,
        contentId: `content-${index}`,
        title: `Item ${index}`,
        author: "Author",
        url: `https://example.com/feed-item-${index}`,
        postedAt: new Date(NOW.getTime() - index),
      })),
    );
    const seededBookmarks = bookmarkRows(100);
    await session.database.insert(bookmarks).values(seededBookmarks);
    await session.database
      .insert(bookmarkTags)
      .values(seededBookmarks.map(({ id }) => ({ bookmarkId: id, tagId: 20 })));

    session.instrumentation.reset();
    const firstPage = await queryMixedContentPage({
      database: session.database,
      userId: "bounds-user",
      scope: { type: "view", viewId: 10 },
      visibility: "later",
      limit: 30,
    });
    const firstEvidence = session.instrumentation.snapshot();
    expect(firstEvidence.statementCount).toBeLessThanOrEqual(7);
    expect(firstEvidence.materializedRows).toBeLessThanOrEqual(100);

    session.instrumentation.reset();
    await queryMixedContentPage({
      database: session.database,
      userId: "bounds-user",
      scope: { type: "view", viewId: 10 },
      visibility: "later",
      cursor: firstPage.cursor,
      limit: 30,
    });
    const cursorEvidence = session.instrumentation.snapshot();
    expect(cursorEvidence.statementCount).toBeLessThanOrEqual(7);
    expect(cursorEvidence.materializedRows).toBeLessThanOrEqual(100);

    session.instrumentation.reset();
    await queryMixedContentPage({
      database: session.database,
      userId: "bounds-user",
      scope: { type: "tag", tagId: 20 },
      visibility: "later",
      limit: 30,
    });
    const tagEvidence = session.instrumentation.snapshot();
    expect(tagEvidence.statementCount).toBeLessThanOrEqual(4);
    expect(tagEvidence.materializedRows).toBeLessThanOrEqual(100);

    const plan = await session.baseClient.execute({
      sql: "EXPLAIN QUERY PLAN SELECT id FROM serial_bookmark WHERE user_id = ? AND is_saved = ? ORDER BY saved_updated_at DESC, id DESC LIMIT 31",
      args: ["bounds-user", 1],
    });
    expect(plan.rows.map((row) => String(row[3])).join("\n")).toContain(
      "bookmark_user_saved_saved_at_idx",
    );
  });
});
