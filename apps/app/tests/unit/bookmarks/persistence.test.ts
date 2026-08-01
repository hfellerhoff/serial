import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBookmarkTestDatabase } from "./database";
import type { TrustedCapture } from "~/server/bookmarks/contracts";
import {
  deleteBookmark,
  getBookmarkCapture,
  persistBookmarkSave,
  setBookmarkTag,
  setBookmarkView,
  updateBookmarksReadState,
  updateBookmarkState,
} from "~/server/bookmarks/service";
import {
  bookmarks,
  bookmarkTags,
  bookmarkViews,
  contentCategories,
  feedItems,
  feeds,
  pageCaptures,
  user,
  views,
} from "~/server/db/schema";

type TestDatabase = Awaited<
  ReturnType<typeof createBookmarkTestDatabase>
>["database"];
type Cleanup = Awaited<
  ReturnType<typeof createBookmarkTestDatabase>
>["cleanup"];

let database: TestDatabase;
let cleanup: Cleanup;

function trustedCapture(
  canonicalUrl: string,
  contentHash = "a".repeat(64),
): TrustedCapture {
  return {
    title: "Captured article",
    author: "Author",
    publishedAt: new Date("2025-01-01T00:00:00Z"),
    contentHtml: "<article><p>Captured content</p></article>",
    effectiveUrl: canonicalUrl,
    canonicalUrl,
    iconUrl: `${new URL(canonicalUrl).origin}/icon.png`,
    representativeImageUrl: `${new URL(canonicalUrl).origin}/image.jpg`,
    contentHash,
    captureSource: "extension-live-dom",
    extractorVersion: "mozilla-readability-0.6",
    sanitizerPolicyVersion: 1,
    capturedAt: new Date(),
  };
}

async function seedUsers() {
  const now = new Date();
  await database.insert(user).values([
    {
      id: "user-one",
      name: "User One",
      email: "one@example.com",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "user-two",
      name: "User Two",
      email: "two@example.com",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
  ]);
}

async function saveCaptured(
  userId: string,
  sourceUrl: string,
  bookmarkId?: string,
  capture = trustedCapture(sourceUrl),
) {
  return persistBookmarkSave({
    database,
    userId,
    sourceUrl,
    bookmarkId,
    captureAttempt: { ok: true, capture },
  });
}

beforeEach(async () => {
  ({ cleanup, database } = await createBookmarkTestDatabase());
  await seedUsers();
});

afterEach(() => cleanup());

describe("Bookmark persistence", () => {
  it("scopes canonical uniqueness and refresh hints to the authenticated user", async () => {
    const url = "https://example.com/article";
    const first = await persistBookmarkSave({
      database,
      userId: "user-one",
      sourceUrl: url,
      captureAttempt: { ok: false, reason: "unextractable" },
    });
    const refreshed = await persistBookmarkSave({
      database,
      userId: "user-one",
      sourceUrl: `${url}#fragment`,
      captureAttempt: { ok: false, reason: "timeout" },
    });
    const otherUser = await persistBookmarkSave({
      database,
      userId: "user-two",
      sourceUrl: url,
      captureAttempt: { ok: false, reason: "unextractable" },
    });

    expect(first.disposition).toBe("created");
    expect(refreshed.disposition).toBe("refreshed");
    expect(refreshed.bookmark.id).toBe(first.bookmark.id);
    expect(otherUser.bookmark.id).not.toBe(first.bookmark.id);
    await expect(
      database.insert(bookmarks).values({
        userId: "user-one",
        sourceUrl: url,
        canonicalUrl: url,
      }),
    ).rejects.toThrow();
    await expect(
      persistBookmarkSave({
        database,
        userId: "user-two",
        sourceUrl: url,
        bookmarkId: first.bookmark.id,
        captureAttempt: { ok: false, reason: "unextractable" },
      }),
    ).rejects.toThrow("Bookmark not found");
    expect(await database.select().from(bookmarks)).toHaveLength(2);
  });

  it("preserves progress and captures on unchanged or failed refreshes, then resets changed content", async () => {
    const url = "https://example.com/article";
    const created = await saveCaptured("user-one", url);
    await updateBookmarkState({
      database,
      userId: "user-one",
      bookmarkId: created.bookmark.id,
      isSaved: false,
      isRead: true,
      progress: 7,
      duration: 20,
    });

    const unchanged = await saveCaptured(
      "user-one",
      url,
      created.bookmark.id,
      trustedCapture(url),
    );
    expect(unchanged.bookmark).toMatchObject({
      isSaved: true,
      isRead: true,
      progress: 7,
      duration: 20,
    });

    const failed = await persistBookmarkSave({
      database,
      userId: "user-one",
      sourceUrl: "https://other.example/failed-refresh",
      bookmarkId: created.bookmark.id,
      captureAttempt: { ok: false, reason: "timeout" },
    });
    expect(failed.capture).toEqual({ status: "preserved", reason: "timeout" });
    expect(failed.bookmark.canonicalUrl).toBe(url);
    expect(failed.bookmark.sourceUrl).toBe(url);

    const changed = await saveCaptured(
      "user-one",
      url,
      created.bookmark.id,
      trustedCapture(url, "b".repeat(64)),
    );
    expect(changed.bookmark).toMatchObject({ progress: 0, duration: 0 });

    const capture = await getBookmarkCapture({
      database,
      userId: "user-one",
      bookmarkId: created.bookmark.id,
    });
    expect(capture?.status).toBe("capture");
    expect(
      await getBookmarkCapture({
        database,
        userId: "user-one",
        bookmarkId: created.bookmark.id,
        contentHash: "b".repeat(64),
      }),
    ).toEqual({ status: "not-modified", contentHash: "b".repeat(64) });
    expect(
      await getBookmarkCapture({
        database,
        userId: "user-two",
        bookmarkId: created.bookmark.id,
      }),
    ).toBeNull();
  });

  it("consolidates canonical collisions into the oldest Bookmark and unions organization", async () => {
    const now = new Date();
    await database.insert(views).values([
      { id: 1, userId: "user-one", name: "One" },
      { id: 2, userId: "user-one", name: "Two" },
      { id: 3, userId: "user-two", name: "Foreign" },
    ]);
    await database.insert(contentCategories).values([
      {
        id: 1,
        userId: "user-one",
        name: "One",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 2,
        userId: "user-one",
        name: "Two",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 3,
        userId: "user-two",
        name: "Foreign",
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const first = await saveCaptured("user-one", "https://example.com/one");
    const second = await saveCaptured("user-one", "https://example.com/two");
    await database
      .update(bookmarks)
      .set({ createdAt: new Date("2021-01-01T00:00:00Z"), isRead: true })
      .where(eq(bookmarks.id, first.bookmark.id));
    await database
      .update(bookmarks)
      .set({ createdAt: new Date("2020-01-01T00:00:00Z"), isRead: false })
      .where(eq(bookmarks.id, second.bookmark.id));
    await setBookmarkView({
      database,
      userId: "user-one",
      bookmarkId: first.bookmark.id,
      viewId: 1,
      assigned: true,
    });
    await setBookmarkView({
      database,
      userId: "user-one",
      bookmarkId: second.bookmark.id,
      viewId: 2,
      assigned: true,
    });
    await setBookmarkTag({
      database,
      userId: "user-one",
      bookmarkId: first.bookmark.id,
      tagId: 1,
      assigned: true,
    });
    await setBookmarkTag({
      database,
      userId: "user-one",
      bookmarkId: second.bookmark.id,
      tagId: 2,
      assigned: true,
    });

    const consolidated = await saveCaptured(
      "user-one",
      "https://submitted.example/latest",
      second.bookmark.id,
      trustedCapture("https://example.com/one", "c".repeat(64)),
    );
    expect(consolidated).toMatchObject({
      disposition: "consolidated",
      removedBookmarkId: first.bookmark.id,
      bookmark: {
        id: second.bookmark.id,
        sourceUrl: "https://submitted.example/latest",
        canonicalUrl: "https://example.com/one",
        isSaved: true,
        isRead: false,
      },
    });
    expect(
      await database
        .select({ viewId: bookmarkViews.viewId })
        .from(bookmarkViews)
        .where(eq(bookmarkViews.bookmarkId, second.bookmark.id)),
    ).toEqual(expect.arrayContaining([{ viewId: 1 }, { viewId: 2 }]));
    expect(
      await database
        .select({ tagId: bookmarkTags.tagId })
        .from(bookmarkTags)
        .where(eq(bookmarkTags.bookmarkId, second.bookmark.id)),
    ).toEqual(expect.arrayContaining([{ tagId: 1 }, { tagId: 2 }]));
    expect(await database.select().from(bookmarks)).toHaveLength(1);

    await expect(
      setBookmarkView({
        database,
        userId: "user-one",
        bookmarkId: second.bookmark.id,
        viewId: 3,
        assigned: true,
      }),
    ).rejects.toThrow("Organization target not found");
  });

  it("updates independent state timestamps", async () => {
    const created = await saveCaptured("user-one", "https://example.com/state");
    const oldTimestamp = new Date("2020-01-01T00:00:00Z");
    await database
      .update(bookmarks)
      .set({
        savedUpdatedAt: oldTimestamp,
        readUpdatedAt: oldTimestamp,
        progressUpdatedAt: oldTimestamp,
      })
      .where(eq(bookmarks.id, created.bookmark.id));

    const saved = await updateBookmarkState({
      database,
      userId: "user-one",
      bookmarkId: created.bookmark.id,
      isSaved: false,
    });
    expect(saved.savedUpdatedAt.getTime()).toBeGreaterThan(
      oldTimestamp.getTime(),
    );
    expect(saved.readUpdatedAt).toEqual(oldTimestamp);
    expect(saved.progressUpdatedAt).toEqual(oldTimestamp);

    const read = await updateBookmarkState({
      database,
      userId: "user-one",
      bookmarkId: created.bookmark.id,
      isRead: true,
    });
    expect(read.readUpdatedAt.getTime()).toBeGreaterThan(
      oldTimestamp.getTime(),
    );
    expect(read.progressUpdatedAt).toEqual(oldTimestamp);

    const progressed = await updateBookmarkState({
      database,
      userId: "user-one",
      bookmarkId: created.bookmark.id,
      progress: 3,
      duration: 10,
    });
    expect(progressed.progressUpdatedAt.getTime()).toBeGreaterThan(
      oldTimestamp.getTime(),
    );
  });

  it("updates a deduplicated owned Bookmark batch and rejects mixed ownership atomically", async () => {
    const first = await saveCaptured("user-one", "https://example.com/first");
    const second = await saveCaptured("user-one", "https://example.com/second");
    const foreign = await saveCaptured(
      "user-two",
      "https://example.com/foreign",
    );

    const updated = await updateBookmarksReadState({
      database,
      userId: "user-one",
      bookmarkIds: [first.bookmark.id, first.bookmark.id, second.bookmark.id],
      isRead: true,
    });

    expect(updated.map(({ id }) => id).sort()).toEqual(
      [first.bookmark.id, second.bookmark.id].sort(),
    );
    expect(updated.every(({ isRead }) => isRead)).toBe(true);
    await expect(
      updateBookmarksReadState({
        database,
        userId: "user-one",
        bookmarkIds: [first.bookmark.id, foreign.bookmark.id],
        isRead: false,
      }),
    ).rejects.toThrow("Bookmark not found");
    expect(
      await database.query.bookmarks.findFirst({
        where: eq(bookmarks.id, first.bookmark.id),
      }),
    ).toMatchObject({ isRead: true });
  });

  it("keeps Bookmarks independent of Feeds and cascades hard deletion", async () => {
    const url = "https://example.com/shared";
    const created = await saveCaptured("user-one", url);
    const now = new Date();
    await database.insert(feeds).values({
      id: 1,
      userId: "user-one",
      name: "Feed",
      url: "https://example.com/feed.xml",
      platform: "website",
      createdAt: now,
      updatedAt: now,
    });
    await database.insert(feedItems).values({
      id: "feed-item",
      feedId: 1,
      contentId: "shared",
      title: "Shared",
      author: "Author",
      url,
      postedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await database.delete(feeds).where(eq(feeds.id, 1));
    expect(
      await database.query.bookmarks.findFirst({
        where: eq(bookmarks.id, created.bookmark.id),
      }),
    ).toBeDefined();

    await database
      .insert(views)
      .values({ id: 1, userId: "user-one", name: "View" });
    await database.insert(contentCategories).values({
      id: 1,
      userId: "user-one",
      name: "Tag",
      createdAt: now,
      updatedAt: now,
    });
    await setBookmarkView({
      database,
      userId: "user-one",
      bookmarkId: created.bookmark.id,
      viewId: 1,
      assigned: true,
    });
    await setBookmarkTag({
      database,
      userId: "user-one",
      bookmarkId: created.bookmark.id,
      tagId: 1,
      assigned: true,
    });
    await deleteBookmark({
      database,
      userId: "user-one",
      bookmarkId: created.bookmark.id,
    });
    expect(await database.select().from(bookmarks)).toHaveLength(0);
    expect(await database.select().from(pageCaptures)).toHaveLength(0);
    expect(await database.select().from(bookmarkViews)).toHaveLength(0);
    expect(await database.select().from(bookmarkTags)).toHaveLength(0);

    const userCascade = await saveCaptured(
      "user-two",
      "https://example.com/user-cascade",
    );
    await database.delete(user).where(eq(user.id, "user-two"));
    expect(
      await database
        .select()
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.id, userCascade.bookmark.id),
            eq(bookmarks.userId, "user-two"),
          ),
        ),
    ).toHaveLength(0);
    expect(
      await database
        .select()
        .from(pageCaptures)
        .where(eq(pageCaptures.bookmarkId, userCascade.bookmark.id)),
    ).toHaveLength(0);
  });
});
