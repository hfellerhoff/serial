import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApplicationFeedItem } from "~/server/db/schema";
import type { ApplicationBookmark } from "~/server/mixed-content/projection";
import { bookmarkCapturesStore } from "~/lib/data/bookmarks/capture-store";
import { bookmarksStore } from "~/lib/data/bookmarks/store";
import {
  hydrateOfflineBodiesForPage,
  invalidateOfflineHydration,
  planPageBodyHydration,
} from "~/lib/data/offline-hydration";
import { feedItemsStore } from "~/lib/data/store";

const mocks = vi.hoisted(() => ({
  requestFullTextForItems: vi.fn(),
  getCaptures: vi.fn(),
}));

vi.mock("~/lib/orpc", () => ({
  orpcRouterClient: {
    bookmark: { getCaptures: mocks.getCaptures },
    initial: { requestFullTextForItems: mocks.requestFullTextForItems },
  },
}));

const now = new Date("2026-08-31T12:00:00.000Z");

function feedItem(
  overrides: Partial<ApplicationFeedItem> = {},
): ApplicationFeedItem {
  return {
    id: "feed-item-one",
    feedId: 1,
    contentId: "content-one",
    title: "Article",
    author: "Author",
    url: "https://example.com/article",
    thumbnail: "",
    content: "",
    contentSnippet: "preview",
    contentType: "text",
    isWatched: false,
    isWatchLater: true,
    progress: 0,
    duration: 0,
    orientation: null,
    postedAt: now,
    createdAt: now,
    updatedAt: now,
    isWatchedUpdatedAt: null,
    isWatchLaterUpdatedAt: null,
    contentHash: "content-hash",
    platform: "website",
    ...overrides,
  };
}

function bookmark(
  overrides: Partial<ApplicationBookmark> = {},
): ApplicationBookmark {
  return {
    id: "bookmark-one",
    userId: "user-one",
    sourceUrl: "https://example.com/bookmark",
    effectiveUrl: "https://example.com/bookmark",
    canonicalUrl: "https://example.com/bookmark",
    platform: "website",
    contentType: "text",
    orientation: null,
    contentId: null,
    classificationSource: "url",
    classifierVersion: 1,
    isSaved: true,
    isRead: false,
    progress: 0,
    duration: 0,
    savedUpdatedAt: now,
    readUpdatedAt: now,
    progressUpdatedAt: now,
    createdAt: now,
    updatedAt: now,
    title: "Bookmark",
    description: null,
    author: null,
    siteName: "example.com",
    publishedAt: null,
    iconUrl: null,
    thumbnailUrl: null,
    previewSource: "url",
    captureHash: "capture-hash",
    capturedAt: now,
    viewIds: [],
    tagIds: [],
    ...overrides,
  } as unknown as ApplicationBookmark;
}

function planWith(input: {
  feedItems?: ApplicationFeedItem[];
  bookmarks?: ApplicationBookmark[];
  retainedFeedIds?: string[];
  capturedBookmarkIds?: string[];
}) {
  return planPageBodyHydration({
    feedItems: input.feedItems ?? [],
    bookmarks: input.bookmarks ?? [],
    hasRetainedFeedBody: (id) => input.retainedFeedIds?.includes(id) === true,
    hasBookmarkCapture: (id) =>
      input.capturedBookmarkIds?.includes(id) === true,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  invalidateOfflineHydration();
  feedItemsStore.getState().reset();
  bookmarksStore.getState().reset();
  bookmarkCapturesStore.getState().reset();
});

describe("planPageBodyHydration", () => {
  it.each([
    ["video item", feedItem({ contentType: "video" })],
    ["archived item", feedItem({ isWatched: true })],
    ["inbox item", feedItem({ isWatchLater: false })],
  ])("skips a %s entirely", (_label, item) => {
    expect(planWith({ feedItems: [item] })).toEqual({
      retainLoadedFeedItemIds: [],
      fetchFeedItemIds: [],
      fetchBookmarkIds: [],
    });
  });

  it("fetches a Saved Unread text item without a body", () => {
    expect(planWith({ feedItems: [feedItem()] }).fetchFeedItemIds).toEqual([
      "feed-item-one",
    ]);
  });

  it("retains a loaded body only while it is unmarked", () => {
    const loaded = feedItem({ content: "<p>Body</p>" });
    expect(planWith({ feedItems: [loaded] }).retainLoadedFeedItemIds).toEqual([
      "feed-item-one",
    ]);
    expect(
      planWith({ feedItems: [loaded], retainedFeedIds: ["feed-item-one"] }),
    ).toEqual({
      retainLoadedFeedItemIds: [],
      fetchFeedItemIds: [],
      fetchBookmarkIds: [],
    });
  });

  it.each([
    ["uncaptured", bookmark({ captureHash: null })],
    ["unsaved", bookmark({ isSaved: false })],
    ["archived", bookmark({ isRead: true })],
    ["video", bookmark({ contentType: "video" })],
  ])("skips an %s Bookmark", (_label, entity) => {
    expect(planWith({ bookmarks: [entity] }).fetchBookmarkIds).toEqual([]);
  });

  it("fetches a Saved Unread capture only while it is absent", () => {
    expect(planWith({ bookmarks: [bookmark()] }).fetchBookmarkIds).toEqual([
      "bookmark-one",
    ]);
    expect(
      planWith({
        bookmarks: [bookmark()],
        capturedBookmarkIds: ["bookmark-one"],
      }).fetchBookmarkIds,
    ).toEqual([]);
  });
});

describe("hydrateOfflineBodiesForPage", () => {
  it("retries a failed capture fetch on a page that no longer carries it", async () => {
    const entity = bookmark();
    bookmarksStore.getState().upsert(entity);
    mocks.getCaptures.mockRejectedValueOnce(new Error("offline"));
    await hydrateOfflineBodiesForPage({ feedItems: [], bookmarks: [entity] });
    expect(
      bookmarkCapturesStore.getState().capturesDict[entity.id],
    ).toBeUndefined();

    const capture = {
      bookmarkId: entity.id,
      contentHtml: "<p>Capture</p>",
      contentHash: "capture-hash",
      captureSource: "server-static-fetch",
      extractorVersion: "test",
      sanitizerPolicyVersion: 1,
      capturedAt: now,
    };
    mocks.getCaptures.mockResolvedValueOnce([capture]);
    await hydrateOfflineBodiesForPage({ feedItems: [], bookmarks: [] });
    expect(mocks.getCaptures).toHaveBeenCalledTimes(2);
    expect(bookmarkCapturesStore.getState().capturesDict[entity.id]).toEqual(
      capture,
    );
  });

  it("drops a failed fetch when the entity stops qualifying", async () => {
    const entity = bookmark();
    bookmarksStore.getState().upsert(entity);
    mocks.getCaptures.mockRejectedValueOnce(new Error("offline"));
    await hydrateOfflineBodiesForPage({ feedItems: [], bookmarks: [entity] });

    bookmarksStore.getState().upsert({ ...entity, isSaved: false });
    await hydrateOfflineBodiesForPage({ feedItems: [], bookmarks: [] });
    expect(mocks.getCaptures).toHaveBeenCalledTimes(1);
  });

  it("never re-requests a body the server already returned empty", async () => {
    const item = feedItem();
    feedItemsStore.getState().setFeedItems([item]);
    mocks.requestFullTextForItems.mockResolvedValue([
      { id: item.id, content: "", contentSnippet: "" },
    ]);
    await hydrateOfflineBodiesForPage({ feedItems: [item], bookmarks: [] });
    await hydrateOfflineBodiesForPage({ feedItems: [item], bookmarks: [] });
    expect(mocks.requestFullTextForItems).toHaveBeenCalledTimes(1);
  });

  it("re-requests an empty body once its content hash changes", async () => {
    const item = feedItem();
    feedItemsStore.getState().setFeedItems([item]);
    mocks.requestFullTextForItems.mockResolvedValue([
      { id: item.id, content: "", contentSnippet: "" },
    ]);
    await hydrateOfflineBodiesForPage({ feedItems: [item], bookmarks: [] });
    await hydrateOfflineBodiesForPage({ feedItems: [item], bookmarks: [] });
    expect(mocks.requestFullTextForItems).toHaveBeenCalledTimes(1);

    const regenerated = feedItem({ contentHash: "regenerated-hash" });
    feedItemsStore.getState().setFeedItems([regenerated]);
    await hydrateOfflineBodiesForPage({
      feedItems: [regenerated],
      bookmarks: [],
    });
    expect(mocks.requestFullTextForItems).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent page applications into one hydration run", async () => {
    const first = bookmark({ id: "bookmark-a" });
    const second = bookmark({ id: "bookmark-b" });
    bookmarksStore.getState().upsert(first);
    bookmarksStore.getState().upsert(second);
    mocks.getCaptures.mockImplementation(
      ({ bookmarkIds }: { bookmarkIds: string[] }) =>
        Promise.resolve(
          bookmarkIds.map((bookmarkId) => ({
            bookmarkId,
            contentHtml: "<p>Capture</p>",
            contentHash: "capture-hash",
            captureSource: "server-static-fetch",
            extractorVersion: "test",
            sanitizerPolicyVersion: 1,
            capturedAt: now,
          })),
        ),
    );
    const firstRun = hydrateOfflineBodiesForPage({
      feedItems: [],
      bookmarks: [first],
    });
    const secondRun = hydrateOfflineBodiesForPage({
      feedItems: [],
      bookmarks: [second],
    });
    expect(secondRun).toBe(firstRun);
    await firstRun;
    expect(
      bookmarkCapturesStore.getState().capturesDict[first.id],
    ).toBeDefined();
    expect(
      bookmarkCapturesStore.getState().capturesDict[second.id],
    ).toBeDefined();
  });

  it("discards an in-flight fulltext response after invalidation", async () => {
    const item = feedItem();
    feedItemsStore.getState().setFeedItems([item]);
    let resolveFulltext: (items: unknown[]) => void = () => {};
    mocks.requestFullTextForItems.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFulltext = resolve;
      }),
    );
    const hydration = hydrateOfflineBodiesForPage({
      feedItems: [item],
      bookmarks: [],
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    invalidateOfflineHydration();
    resolveFulltext([
      { id: item.id, content: "<p>Late body</p>", contentSnippet: "late" },
    ]);
    await hydration;
    expect(feedItemsStore.getState().feedItemsDict[item.id]?.content).toBe("");
  });

  it("discards an in-flight capture response after invalidation", async () => {
    const entity = bookmark();
    bookmarksStore.getState().upsert(entity);
    let resolveCaptures: (captures: unknown[]) => void = () => {};
    mocks.getCaptures.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCaptures = resolve;
      }),
    );
    const hydration = hydrateOfflineBodiesForPage({
      feedItems: [],
      bookmarks: [entity],
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    invalidateOfflineHydration();
    bookmarkCapturesStore.getState().reset();
    resolveCaptures([
      {
        bookmarkId: entity.id,
        contentHtml: "<p>Stale user capture</p>",
        contentHash: "capture-hash",
        captureSource: "server-static-fetch",
        extractorVersion: "test",
        sanitizerPolicyVersion: 1,
        capturedAt: now,
      },
    ]);
    await hydration;
    expect(bookmarkCapturesStore.getState().capturesDict).toEqual({});
  });
});
