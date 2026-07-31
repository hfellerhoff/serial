import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApplicationFeedItem, ApplicationView } from "~/server/db/schema";
import type {
  ApplicationBookmark,
  MixedContentPage,
  MixedContentReference,
} from "~/server/mixed-content/projection";
import { bookmarksStore } from "~/lib/data/bookmarks/store";
import { feedItemsStore } from "~/lib/data/store";
import {
  getMixedScopeKey,
  mixedContentStore,
} from "~/lib/data/mixed-content/store";
import { viewsStore } from "~/lib/data/views/store";
import { processPublishedChunks } from "~/lib/data/subscriptionCoordinator";
import {
  partitionMixedReadTargets,
  setMixedReadValue,
} from "~/lib/data/mixed-content/mutations";
import { bookmarkManifestValue } from "~/lib/data/bookmarks/manifest";
import { computeBookmarkDiff } from "~/server/mixed-content/sync";

const NOW = new Date("2026-07-30T12:00:00.000Z");

const orpcMocks = vi.hoisted(() => ({
  setBookmarkBulkReadValue: vi.fn(),
  setFeedBulkWatchedValue: vi.fn(),
}));

vi.mock("~/lib/orpc", () => ({
  orpc: {},
  orpcRouterClient: {
    bookmark: { setBulkReadValue: orpcMocks.setBookmarkBulkReadValue },
    feedItem: { setBulkWatchedValue: orpcMocks.setFeedBulkWatchedValue },
  },
}));

function bookmark(
  overrides: Partial<ApplicationBookmark> = {},
): ApplicationBookmark {
  return {
    id: "bookmark-one",
    userId: "user-one",
    sourceUrl: "https://example.com/article",
    canonicalUrl: "https://example.com/article",
    isSaved: true,
    isRead: false,
    progress: 4,
    duration: 10,
    savedUpdatedAt: NOW,
    readUpdatedAt: NOW,
    progressUpdatedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    title: "Article",
    author: "Writer",
    publishedAt: null,
    effectiveUrl: "https://example.com/article",
    iconUrl: null,
    representativeImageUrl: null,
    captureHash: "capture-hash",
    capturedAt: NOW,
    viewIds: [10],
    tagIds: [],
    ...overrides,
  };
}

function feedItem(id: string, url: string): ApplicationFeedItem {
  return {
    id,
    feedId: 1,
    contentId: id,
    title: id,
    author: "Author",
    url,
    thumbnail: "",
    content: "",
    contentSnippet: "",
    isWatched: false,
    isWatchLater: false,
    progress: 0,
    duration: 0,
    orientation: "horizontal",
    postedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    isWatchedUpdatedAt: null,
    isWatchLaterUpdatedAt: null,
    contentHash: null,
    platform: "website",
  };
}

function view(): ApplicationView {
  return {
    id: 10,
    userId: "user-one",
    name: "Reading",
    daysWindow: 0,
    readStatus: 0,
    orientation: "horizontal",
    contentType: "longform",
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

function reference(
  entityKind: "bookmark" | "feed-item",
  entityId: string,
): MixedContentReference {
  return { entityKind, entityId, sectionPlacement: null, normalizedAt: NOW };
}

function page(references: MixedContentReference[]): MixedContentPage {
  return {
    references,
    bookmarks: [],
    feedItems: [],
    cursor: null,
    hasMore: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  bookmarksStore.getState().reset();
  feedItemsStore.getState().reset();
  mixedContentStore.getState().reset();
  viewsStore.getState().set([view()]);
});

describe("Bookmark synchronization and local mixed reprojection", () => {
  it("hydrates Bookmark and Feed-item entities into separate caches from a discriminated page", () => {
    const savedBookmark = bookmark();
    const item = feedItem("feed-one", "https://example.com/feed");
    processPublishedChunks([
      {
        source: "mixed",
        chunk: {
          type: "mixed-content-page",
          scope: { type: "view", viewId: 10 },
          visibility: "later",
          page: {
            ...page([
              reference("bookmark", savedBookmark.id),
              reference("feed-item", item.id),
            ]),
            bookmarks: [savedBookmark],
            feedItems: [item],
          },
          replacesScope: true,
        },
      },
    ]);

    expect(bookmarksStore.getState().getBookmark(savedBookmark.id)).toEqual(
      savedBookmark,
    );
    expect(feedItemsStore.getState().feedItemsDict[item.id]).toEqual(item);
    expect(
      mixedContentStore.getState().scopes[
        getMixedScopeKey({ type: "view", viewId: 10 }, "later")
      ]?.references,
    ).toHaveLength(2);
  });

  it("suppresses matching Feed items immediately, moves Bookmark visibility, restores on deletion, and reports scopes for refill", () => {
    const matchingOne = feedItem(
      "feed-match-one",
      "https://example.com/article#fragment",
    );
    const matchingTwo = feedItem(
      "feed-match-two",
      "https://example.com/article",
    );
    const other = feedItem("feed-other", "https://example.com/other");
    for (const item of [matchingOne, matchingTwo, other]) {
      feedItemsStore.getState().setFeedItem(item.id, item);
    }
    const scope = { type: "view" as const, viewId: 10 };
    mixedContentStore.getState().applyPage({
      scope,
      visibility: "unread",
      page: page([
        reference("feed-item", matchingOne.id),
        reference("feed-item", matchingTwo.id),
        reference("feed-item", other.id),
      ]),
      replacesScope: true,
      feedItems: feedItemsStore.getState().feedItemsDict,
    });
    mixedContentStore.getState().applyPage({
      scope,
      visibility: "read",
      page: page([]),
      replacesScope: true,
      feedItems: feedItemsStore.getState().feedItemsDict,
    });
    mixedContentStore.getState().applyPage({
      scope,
      visibility: "later",
      page: page([]),
      replacesScope: true,
      feedItems: feedItemsStore.getState().feedItemsDict,
    });

    const saved = bookmark();
    const affectedOnSave = processPublishedChunks([
      {
        source: "bookmark",
        chunk: { type: "bookmark-upsert", bookmark: saved },
      },
    ]);
    expect(affectedOnSave).toHaveLength(2);
    expect(
      mixedContentStore.getState().scopes[getMixedScopeKey(scope, "unread")]
        ?.references,
    ).toEqual([reference("feed-item", other.id)]);
    expect(feedItemsStore.getState().feedItemsDict[matchingOne.id]).toEqual(
      matchingOne,
    );

    const archived = bookmark({ isSaved: false, isRead: true });
    processPublishedChunks([
      {
        source: "bookmark",
        chunk: { type: "bookmark-upsert", bookmark: archived },
      },
    ]);
    expect(
      mixedContentStore.getState().scopes[getMixedScopeKey(scope, "read")]
        ?.references,
    ).toEqual([reference("bookmark", archived.id)]);

    const affectedOnDelete = processPublishedChunks([
      {
        source: "bookmark",
        chunk: {
          type: "bookmark-delete",
          id: archived.id,
          canonicalUrl: archived.canonicalUrl,
        },
      },
    ]);
    expect(affectedOnDelete).toHaveLength(2);
    expect(
      mixedContentStore.getState().scopes[getMixedScopeKey(scope, "unread")]
        ?.references,
    ).toEqual([
      reference("feed-item", other.id),
      reference("feed-item", matchingTwo.id),
      reference("feed-item", matchingOne.id),
    ]);
  });

  it("reconciles entity, state, organization, progress, and capture metadata through the manifest", () => {
    const cached = bookmark();
    const updated = bookmark({
      progress: 8,
      duration: 12,
      progressUpdatedAt: new Date("2026-07-30T12:01:00Z"),
      tagIds: [4],
      captureHash: "new-hash",
      capturedAt: new Date("2026-07-30T12:02:00Z"),
      updatedAt: new Date("2026-07-30T12:02:00Z"),
    });
    expect(
      computeBookmarkDiff(
        [cached],
        [{ id: cached.id, version: bookmarkManifestValue(cached) }],
      ),
    ).toEqual([{ status: "unchanged", id: cached.id }]);
    expect(
      computeBookmarkDiff(
        [updated],
        [
          { id: cached.id, version: bookmarkManifestValue(cached) },
          { id: "deleted-offline", version: "old" },
        ],
      ),
    ).toEqual([
      { status: "updated", bookmark: updated },
      { status: "deleted", id: "deleted-offline" },
    ]);
  });

  it("marks mixed and section-level references read and supports undo", async () => {
    const item = feedItem("feed-one", "https://example.com/feed");
    const archivedBookmark = bookmark({ isSaved: false, isRead: false });
    feedItemsStore.getState().setFeedItem(item.id, item);
    bookmarksStore.getState().upsert(archivedBookmark);
    const scope = { type: "view" as const, viewId: 10 };
    const references = [
      reference("bookmark", archivedBookmark.id),
      reference("feed-item", item.id),
    ];
    mixedContentStore.getState().applyPage({
      scope,
      visibility: "unread",
      page: page(references),
      replacesScope: true,
      feedItems: feedItemsStore.getState().feedItemsDict,
    });
    mixedContentStore.getState().applyPage({
      scope,
      visibility: "read",
      page: page([]),
      replacesScope: true,
      feedItems: feedItemsStore.getState().feedItemsDict,
    });
    orpcMocks.setBookmarkBulkReadValue.mockResolvedValue([]);
    orpcMocks.setFeedBulkWatchedValue.mockImplementation(
      ({ isWatched }: { isWatched: boolean }) =>
        Promise.resolve([
          { ...item, isWatched, isWatchedUpdatedAt: NOW, updatedAt: NOW },
        ]),
    );

    expect(partitionMixedReadTargets(references)).toEqual({
      bookmarkIds: [archivedBookmark.id],
      feedItems: [{ id: item.id, feedId: item.feedId }],
    });

    await setMixedReadValue({ references, isRead: true });
    expect(
      bookmarksStore.getState().getBookmark(archivedBookmark.id)?.isRead,
    ).toBe(true);
    expect(feedItemsStore.getState().feedItemsDict[item.id]?.isWatched).toBe(
      true,
    );
    expect(
      mixedContentStore.getState().scopes[getMixedScopeKey(scope, "unread")]
        ?.references,
    ).toEqual([reference("feed-item", item.id)]);
    expect(
      mixedContentStore
        .getState()
        .scopes[getMixedScopeKey(scope, "read")]?.references.map(
          ({ entityId }) => entityId,
        ),
    ).toEqual([archivedBookmark.id]);

    await setMixedReadValue({ references, isRead: false });
    expect(
      bookmarksStore.getState().getBookmark(archivedBookmark.id)?.isRead,
    ).toBe(false);
    expect(feedItemsStore.getState().feedItemsDict[item.id]?.isWatched).toBe(
      false,
    );
    expect(orpcMocks.setBookmarkBulkReadValue).toHaveBeenNthCalledWith(2, {
      bookmarkIds: [archivedBookmark.id],
      isRead: false,
    });
    expect(orpcMocks.setFeedBulkWatchedValue).toHaveBeenNthCalledWith(2, {
      items: [{ id: item.id, feedId: item.feedId }],
      isWatched: false,
    });
  });

  it("restores Bookmark projection when an optimistic read change fails", async () => {
    const unreadBookmark = bookmark({ isSaved: false, isRead: false });
    bookmarksStore.getState().upsert(unreadBookmark);
    const scope = { type: "view" as const, viewId: 10 };
    const references = [reference("bookmark", unreadBookmark.id)];
    mixedContentStore.getState().applyPage({
      scope,
      visibility: "unread",
      page: page(references),
      replacesScope: true,
      feedItems: feedItemsStore.getState().feedItemsDict,
    });
    mixedContentStore.getState().applyPage({
      scope,
      visibility: "read",
      page: page([]),
      replacesScope: true,
      feedItems: feedItemsStore.getState().feedItemsDict,
    });
    orpcMocks.setBookmarkBulkReadValue.mockRejectedValueOnce(
      new Error("write failed"),
    );

    await expect(
      setMixedReadValue({ references, isRead: true }),
    ).rejects.toThrow("write failed");

    expect(
      bookmarksStore.getState().getBookmark(unreadBookmark.id)?.isRead,
    ).toBe(false);
    expect(
      mixedContentStore.getState().scopes[getMixedScopeKey(scope, "unread")]
        ?.references,
    ).toEqual(references);
    expect(
      mixedContentStore.getState().scopes[getMixedScopeKey(scope, "read")]
        ?.references,
    ).toEqual([]);
  });
});
