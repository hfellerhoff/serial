import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBookmarkTestDatabase } from "./database";
import type {
  BookmarkObservationResult,
  CaptureFailureReason,
  TrustedPageCapture,
} from "~/server/bookmarks/contracts";
import { buildUrlFallbackObservation } from "~/server/bookmarks/extract";
import {
  createExtensionBookmarkTag,
  createExtensionBookmarkView,
} from "~/server/bookmarks/extensionOrganization";
import {
  deleteBookmark,
  getBookmarkCapture,
  persistBookmarkSave,
  saveBookmarkFromExtension,
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
): BookmarkObservationResult {
  const capture: TrustedPageCapture = {
    contentHtml: "<article><p>Captured content</p></article>",
    contentHash,
    captureSource: "extension-live-dom",
    extractorVersion: "mozilla-readability-0.6",
    sanitizerPolicyVersion: 1,
    capturedAt: new Date(),
  };
  return {
    observation: {
      effectiveUrl: canonicalUrl,
      canonicalUrl,
      classification: {
        platform: "website",
        contentType: "text",
        orientation: null,
        contentId: null,
        classificationSource: "extension-live-dom",
        classifierVersion: 1,
      },
      preview: {
        title: "Captured article",
        description: null,
        author: "Author",
        siteName: null,
        publishedAt: new Date("2025-01-01T00:00:00Z"),
        iconUrl: `${new URL(canonicalUrl).origin}/icon.png`,
        thumbnailUrl: `${new URL(canonicalUrl).origin}/image.jpg`,
        previewSource: "extension-live-dom",
      },
      capture,
    },
  };
}

function failedObservation(
  sourceUrl: string,
  captureFailureReason: CaptureFailureReason,
): BookmarkObservationResult {
  return {
    observation: buildUrlFallbackObservation(sourceUrl),
    captureFailureReason,
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
    observationResult: capture,
  });
}

beforeEach(async () => {
  ({ cleanup, database } = await createBookmarkTestDatabase());
  await seedUsers();
});

afterEach(() => cleanup());

describe("Bookmark persistence", () => {
  it("persists extracted preview icons and thumbnails", async () => {
    const sourceUrl = "https://example.com/preview";
    const result = await saveCaptured("user-one", sourceUrl);
    const stored = await database.query.bookmarks.findFirst({
      where: eq(bookmarks.id, result.bookmark.id),
    });

    const expectedPreview = {
      iconUrl: "https://example.com/icon.png",
      thumbnailUrl: "https://example.com/image.jpg",
    };
    expect(result.bookmark).toMatchObject(expectedPreview);
    expect(stored).toMatchObject(expectedPreview);
  });

  it("creates extension organization only for an owned Bookmark", async () => {
    const own = await saveCaptured(
      "user-one",
      "https://example.com/organization",
    );
    const view = await createExtensionBookmarkView({
      database,
      userId: "user-one",
      bookmarkId: own.bookmark.id,
      name: "Essays",
    });
    const tag = await createExtensionBookmarkTag({
      database,
      userId: "user-one",
      bookmarkId: own.bookmark.id,
      name: "Research",
    });

    expect(view).toMatchObject({ name: "Essays", tagIds: [] });
    expect(tag).toMatchObject({ name: "Research" });
    await expect(
      createExtensionBookmarkView({
        database,
        userId: "user-two",
        bookmarkId: own.bookmark.id,
        name: "Unauthorized",
      }),
    ).rejects.toThrow("Bookmark not found");
  });

  it("keeps the extension preflight failure reason on a URL-only save", async () => {
    const url = "https://example.com/oversized";
    const result = await saveBookmarkFromExtension({
      database,
      userId: "user-one",
      sourceUrl: url,
      captureFailureReason: "too_large",
      capture: {
        effectiveUrl: url,
        title: "Oversized article",
        descriptor: {
          platform: "website",
          contentType: "text",
          orientation: null,
          contentId: null,
          classifierVersion: 1,
        },
      },
    });

    expect(result.capture).toEqual({
      status: "unavailable",
      reason: "too_large",
    });
    expect(result.bookmark.title).toBe("Oversized article");
  });

  it("scopes canonical uniqueness and refresh hints to the authenticated user", async () => {
    const url = "https://example.com/article";
    const first = await persistBookmarkSave({
      database,
      userId: "user-one",
      sourceUrl: url,
      observationResult: failedObservation(url, "unextractable"),
    });
    const refreshed = await persistBookmarkSave({
      database,
      userId: "user-one",
      sourceUrl: `${url}#fragment`,
      observationResult: failedObservation(`${url}#fragment`, "timeout"),
    });
    const otherUser = await persistBookmarkSave({
      database,
      userId: "user-two",
      sourceUrl: url,
      observationResult: failedObservation(url, "unextractable"),
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
        observationResult: failedObservation(url, "unextractable"),
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
      observationResult: failedObservation(
        "https://other.example/failed-refresh",
        "timeout",
      ),
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

  it("deletes a capture when the descriptor changes to a disallowed combination", async () => {
    const url = "https://example.com/video";
    const created = await saveCaptured("user-one", url);
    const videoObservation = trustedCapture(url);
    videoObservation.observation.classification = {
      ...videoObservation.observation.classification,
      contentType: "video",
    };
    videoObservation.observation.capture = null;
    videoObservation.captureFailureReason = "unsupported_content";

    const refreshed = await persistBookmarkSave({
      database,
      userId: "user-one",
      sourceUrl: url,
      bookmarkId: created.bookmark.id,
      observationResult: videoObservation,
    });

    expect(refreshed.bookmark.contentType).toBe("video");
    expect(refreshed.capture).toEqual({
      status: "unavailable",
      reason: "unsupported_content",
    });
    expect(
      await getBookmarkCapture({
        database,
        userId: "user-one",
        bookmarkId: created.bookmark.id,
      }),
    ).toBeNull();
  });

  it("matches validated provider identity before canonical URL", async () => {
    const contentId = "dQw4w9WgXcQ";
    const firstUrl = `https://youtube.com/watch?v=${contentId}`;
    const secondUrl = `https://youtu.be/${contentId}`;
    const firstObservation = failedObservation(firstUrl, "unsupported_content");
    firstObservation.observation.classification = {
      platform: "youtube",
      contentType: "video",
      orientation: null,
      contentId,
      classificationSource: "url",
      classifierVersion: 1,
    };
    const first = await persistBookmarkSave({
      database,
      userId: "user-one",
      sourceUrl: firstUrl,
      observationResult: firstObservation,
    });
    const secondObservation = failedObservation(
      secondUrl,
      "unsupported_content",
    );
    secondObservation.observation.classification = {
      ...firstObservation.observation.classification,
    };
    const refreshed = await persistBookmarkSave({
      database,
      userId: "user-one",
      sourceUrl: secondUrl,
      observationResult: secondObservation,
    });
    const otherUser = await persistBookmarkSave({
      database,
      userId: "user-two",
      sourceUrl: secondUrl,
      observationResult: secondObservation,
    });

    expect(refreshed.disposition).toBe("refreshed");
    expect(refreshed.bookmark.id).toBe(first.bookmark.id);
    expect(otherUser.bookmark.id).not.toBe(first.bookmark.id);
  });

  it("carries a valid capture from a removed duplicate into the oldest survivor", async () => {
    const captured = await saveCaptured(
      "user-one",
      "https://example.com/captured",
    );
    const survivor = await saveCaptured(
      "user-one",
      "https://example.com/survivor",
    );
    await database
      .update(bookmarks)
      .set({ createdAt: new Date("2020-01-01T00:00:00Z") })
      .where(eq(bookmarks.id, survivor.bookmark.id));
    await database
      .delete(pageCaptures)
      .where(eq(pageCaptures.bookmarkId, survivor.bookmark.id));

    const consolidated = await persistBookmarkSave({
      database,
      userId: "user-one",
      sourceUrl: "https://example.com/captured",
      bookmarkId: survivor.bookmark.id,
      observationResult: failedObservation(
        "https://example.com/captured",
        "timeout",
      ),
    });

    expect(consolidated.disposition).toBe("consolidated");
    expect(consolidated.bookmark.id).toBe(survivor.bookmark.id);
    expect(consolidated.removedBookmarkIds).toEqual([captured.bookmark.id]);
    expect(
      await getBookmarkCapture({
        database,
        userId: "user-one",
        bookmarkId: survivor.bookmark.id,
      }),
    ).toMatchObject({ status: "capture" });
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
