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
import { projectLocalMixedContentOrder } from "~/lib/data/mixed-content/bookmarkProjection";
import { viewsStore } from "~/lib/data/views/store";
import { UNCATEGORIZED_VIEW_ID } from "~/lib/data/views/constants";
import {
  applyRequestedMixedContentPage,
  processPublishedChunks,
} from "~/lib/data/subscriptionCoordinator";
import {
  partitionMixedReadTargets,
  setMixedReadValue,
} from "~/lib/data/mixed-content/mutations";
import { dataRequestActions } from "~/lib/data/directRequests";
import { applyReconciliationFirstPage } from "~/lib/data/reconciliationPage";
import { getMixedContentMembershipRevision } from "~/lib/data/mixed-content/membershipRevision";

const NOW = new Date("2026-07-30T12:00:00.000Z");

const orpcMocks = vi.hoisted(() => ({
  setBookmarkBulkReadValue: vi.fn(),
  setFeedBulkWatchedValue: vi.fn(),
  requestPage: vi.fn(),
  getCaptures: vi.fn().mockResolvedValue([]),
  requestFullTextForItems: vi.fn().mockResolvedValue([]),
}));

vi.mock("~/lib/orpc", () => ({
  orpc: {},
  orpcRouterClient: {
    bookmark: {
      setBulkReadValue: orpcMocks.setBookmarkBulkReadValue,
      getCaptures: orpcMocks.getCaptures,
    },
    feedItem: { setBulkWatchedValue: orpcMocks.setFeedBulkWatchedValue },
    initial: { requestFullTextForItems: orpcMocks.requestFullTextForItems },
    mixedContent: { requestPage: orpcMocks.requestPage },
  },
}));

function bookmark(
  overrides: Partial<ApplicationBookmark> = {},
): ApplicationBookmark {
  return {
    id: "bookmark-one",
    userId: "user-one",
    sourceUrl: "https://example.com/article",
    effectiveUrl: "https://example.com/article",
    canonicalUrl: "https://example.com/article",
    platform: "website",
    contentType: "text",
    orientation: null,
    contentId: null,
    classificationSource: "url",
    classifierVersion: 1,
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
    description: null,
    author: "Writer",
    siteName: "example.com",
    publishedAt: null,
    iconUrl: null,
    thumbnailUrl: null,
    previewSource: "url",
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
    contentType: "text",
    isWatched: false,
    isWatchLater: false,
    progress: 0,
    duration: 0,
    orientation: null,
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
    contentFilter: 3,
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

describe("Bookmark projection events and direct mixed pages", () => {
  it("rejects an in-flight page after a list-changing Bookmark event", async () => {
    const savedBookmark = bookmark();
    const scope = { type: "view" as const, viewId: 10 };
    const contentStatus = {
      saveStatus: "saved" as const,
      archiveStatus: "unread" as const,
    };
    const references = [reference("bookmark", savedBookmark.id)];
    applyRequestedMixedContentPage({
      scope,
      contentStatus,
      page: { ...page(references), bookmarks: [savedBookmark] },
      replacesScope: true,
    });

    let resolvePage:
      | ((value: MixedContentPage | PromiseLike<MixedContentPage>) => void)
      | undefined;
    orpcMocks.requestPage.mockReturnValue(
      new Promise<MixedContentPage>((resolve) => {
        resolvePage = resolve;
      }),
    );
    const request = dataRequestActions.requestMixedContentPage(
      scope,
      contentStatus,
    );
    const revisionBeforeEvent = getMixedContentMembershipRevision();
    const archivedBookmark = bookmark({
      isRead: true,
      readUpdatedAt: new Date(NOW.getTime() + 1),
      updatedAt: new Date(NOW.getTime() + 1),
    });
    const affectedScopes = processPublishedChunks([
      {
        source: "bookmark",
        chunk: {
          type: "bookmark-upsert",
          bookmark: archivedBookmark,
          affectsListProjection: true,
        },
      },
      {
        source: "bookmark",
        chunk: {
          type: "bookmark-upsert",
          bookmark: archivedBookmark,
          affectsListProjection: true,
        },
      },
    ]);
    resolvePage?.({
      ...page(references),
      bookmarks: [savedBookmark],
    });
    await request;

    expect(affectedScopes).toHaveLength(1);
    expect(getMixedContentMembershipRevision()).toBe(revisionBeforeEvent + 1);
    expect(
      mixedContentStore.getState().scopes[
        getMixedScopeKey(scope, contentStatus)
      ]?.references,
    ).toEqual([]);
  });

  it("advances membership once for retained Bookmark batches and deletions", () => {
    const first = bookmark({ id: "batch-one" });
    const second = bookmark({ id: "batch-two" });
    const scope = { type: "view" as const, viewId: 10 };
    const contentStatus = {
      saveStatus: "saved" as const,
      archiveStatus: "unread" as const,
    };
    applyRequestedMixedContentPage({
      scope,
      contentStatus,
      page: {
        ...page([
          reference("bookmark", first.id),
          reference("bookmark", second.id),
        ]),
        bookmarks: [first, second],
      },
      replacesScope: true,
    });
    const revisionBeforeBatch = getMixedContentMembershipRevision();

    const affectedByBatch = processPublishedChunks([
      {
        source: "bookmark",
        chunk: {
          type: "bookmark-upsert-batch",
          bookmarks: [
            bookmark({ id: first.id, isRead: true }),
            bookmark({ id: second.id, isRead: true }),
          ],
        },
      },
    ]);

    expect(affectedByBatch).toHaveLength(1);
    expect(getMixedContentMembershipRevision()).toBe(revisionBeforeBatch + 1);

    const revisionBeforeDeletion = getMixedContentMembershipRevision();
    processPublishedChunks([
      {
        source: "bookmark",
        chunk: {
          type: "bookmark-delete",
          id: first.id,
          canonicalUrl: first.canonicalUrl,
        },
      },
    ]);

    expect(getMixedContentMembershipRevision()).toBe(
      revisionBeforeDeletion + 1,
    );
  });

  it("rejects an in-flight page after a mixed Bookmark read mutation", async () => {
    const savedBookmark = bookmark();
    const scope = { type: "view" as const, viewId: 10 };
    const contentStatus = {
      saveStatus: "saved" as const,
      archiveStatus: "unread" as const,
    };
    const references = [reference("bookmark", savedBookmark.id)];
    applyRequestedMixedContentPage({
      scope,
      contentStatus,
      page: { ...page(references), bookmarks: [savedBookmark] },
      replacesScope: true,
    });

    let resolvePage:
      | ((value: MixedContentPage | PromiseLike<MixedContentPage>) => void)
      | undefined;
    orpcMocks.requestPage.mockReturnValue(
      new Promise<MixedContentPage>((resolve) => {
        resolvePage = resolve;
      }),
    );
    let resolveBulkRead: ((value: unknown[]) => void) | undefined;
    orpcMocks.setBookmarkBulkReadValue.mockReturnValue(
      new Promise<unknown[]>((resolve) => {
        resolveBulkRead = resolve;
      }),
    );

    const request = dataRequestActions.requestMixedContentPage(
      scope,
      contentStatus,
    );
    const mutation = setMixedReadValue({ references, isRead: true });
    resolvePage?.({
      ...page(references),
      bookmarks: [savedBookmark],
    });
    await request;
    const bookmarkAfterRequest = bookmarksStore
      .getState()
      .getBookmark(savedBookmark.id);
    const referencesAfterRequest =
      mixedContentStore.getState().scopes[
        getMixedScopeKey(scope, contentStatus)
      ]?.references;
    resolveBulkRead?.([]);
    await mutation;

    expect(bookmarkAfterRequest?.isRead).toBe(true);
    expect(referencesAfterRequest).toEqual([]);
  });

  it("rejects stale reconciliation authority after a Bookmark read mutation", async () => {
    const savedBookmark = bookmark();
    const scope = { type: "view" as const, viewId: 10 };
    const contentStatus = {
      saveStatus: "saved" as const,
      archiveStatus: "unread" as const,
    };
    const references = [reference("bookmark", savedBookmark.id)];
    applyRequestedMixedContentPage({
      scope,
      contentStatus,
      page: { ...page(references), bookmarks: [savedBookmark] },
      replacesScope: true,
    });
    const membershipRevision = getMixedContentMembershipRevision();
    let resolveBulkRead: ((value: unknown[]) => void) | undefined;
    orpcMocks.setBookmarkBulkReadValue.mockReturnValue(
      new Promise<unknown[]>((resolve) => {
        resolveBulkRead = resolve;
      }),
    );

    const mutation = setMixedReadValue({ references, isRead: true });
    const applied = applyReconciliationFirstPage({
      target: { type: "scope", scope, contentStatus },
      membershipRevision,
      orderedRefs: references,
      bookmarkDiffs: [{ status: "upsert", entity: savedBookmark }],
      feedItemDiffs: [],
      cursor: null,
      hasMore: false,
    });
    const bookmarkAfterRequest = bookmarksStore
      .getState()
      .getBookmark(savedBookmark.id);
    resolveBulkRead?.([]);
    await mutation;

    expect(applied).toBe(false);
    expect(bookmarkAfterRequest?.isRead).toBe(true);
  });

  it("projects locally cached Bookmarks only into their owned Views", () => {
    const assigned = bookmark({ id: "assigned", viewIds: [10] });
    const unassigned = bookmark({ id: "unassigned", viewIds: [] });
    const emptyView = { ...view(), id: 11, feedIds: [] };
    const allViews = [view(), emptyView];

    expect(
      projectLocalMixedContentOrder({
        feedItemIds: [],
        feedItems: {},
        bookmarks: { assigned, unassigned },
        scope: { type: "view", viewId: 10 },
        views: allViews,
        contentStatus: { saveStatus: "saved", archiveStatus: "unread" },
      }),
    ).toEqual(["assigned"]);
    expect(
      projectLocalMixedContentOrder({
        feedItemIds: [],
        feedItems: {},
        bookmarks: { assigned, unassigned },
        scope: { type: "view", viewId: 11 },
        views: allViews,
        contentStatus: { saveStatus: "saved", archiveStatus: "unread" },
      }),
    ).toEqual([]);
    expect(
      projectLocalMixedContentOrder({
        feedItemIds: [],
        feedItems: {},
        bookmarks: { assigned, unassigned },
        scope: { type: "view", viewId: UNCATEGORIZED_VIEW_ID },
        views: allViews,
        contentStatus: { saveStatus: "saved", archiveStatus: "unread" },
      }),
    ).toEqual(["unassigned"]);
  });

  it("orders a page-plus local archived View globally across sections", () => {
    const sectionedView: ApplicationView = {
      ...view(),
      categoryIds: [100],
      feedIds: [1, 2],
      viewSections: [
        {
          id: 1,
          viewId: 10,
          placement: 0,
          itemType: "feed",
          itemId: 1,
          layout: null,
          createdAt: NOW,
          updatedAt: NOW,
        },
        {
          id: 2,
          viewId: 10,
          placement: 1,
          itemType: "tag",
          itemId: 100,
          layout: null,
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    };
    const earlierItems = Array.from({ length: 30 }, (_, index) => ({
      ...feedItem(
        `earlier-${index.toString().padStart(2, "0")}`,
        `https://example.com/earlier-${index}`,
      ),
      feedId: 1,
      isWatched: true,
      isWatchedUpdatedAt: new Date(NOW.getTime() - index * 1_000),
    }));
    const equalFeedItem = {
      ...feedItem("z-equal-feed", "https://example.com/z-equal-feed"),
      feedId: 2,
      isWatched: true,
      isWatchedUpdatedAt: new Date("2026-07-30T13:00:00.000Z"),
    };
    const equalBookmark = bookmark({
      id: "a-equal-bookmark",
      isSaved: false,
      isRead: true,
      readUpdatedAt: new Date("2026-07-30T13:00:00.000Z"),
      viewIds: [10],
    });

    const ordered = projectLocalMixedContentOrder({
      feedItemIds: [...earlierItems.map(({ id }) => id), equalFeedItem.id],
      feedItems: Object.fromEntries(
        [...earlierItems, equalFeedItem].map((item) => [item.id, item]),
      ),
      bookmarks: { [equalBookmark.id]: equalBookmark },
      scope: { type: "view", viewId: 10 },
      views: [sectionedView],
      contentStatus: { saveStatus: "inbox", archiveStatus: "archived" },
      feedCategories: [{ feedId: 2, categoryId: 100 }],
    });

    expect(ordered).toHaveLength(32);
    expect(ordered.slice(0, 2)).toEqual([equalFeedItem.id, equalBookmark.id]);
    expect(new Set(ordered).size).toBe(32);
  });

  it("hydrates Bookmark and Feed-item entities into separate caches from a discriminated page", () => {
    const savedBookmark = bookmark();
    const item = feedItem("feed-one", "https://example.com/feed");
    applyRequestedMixedContentPage({
      scope: { type: "view", viewId: 10 },
      contentStatus: { saveStatus: "saved", archiveStatus: "unread" },
      page: {
        ...page([
          reference("bookmark", savedBookmark.id),
          reference("feed-item", item.id),
        ]),
        bookmarks: [savedBookmark],
        feedItems: [item],
      },
      replacesScope: true,
    });

    expect(bookmarksStore.getState().getBookmark(savedBookmark.id)).toEqual(
      savedBookmark,
    );
    expect(feedItemsStore.getState().feedItemsDict[item.id]).toEqual(item);
    expect(
      mixedContentStore.getState().scopes[
        getMixedScopeKey(
          { type: "view", viewId: 10 },
          { saveStatus: "saved", archiveStatus: "unread" },
        )
      ]?.references,
    ).toHaveLength(2);
  });

  it("commits every incoming mixed page with one entity-store notification", () => {
    const bookmarks = Array.from({ length: 30 }, (_, index) =>
      bookmark({ id: `bookmark-${index}` }),
    );
    const items = Array.from({ length: 30 }, (_, index) =>
      feedItem(`feed-${index}`, `https://example.com/feed-${index}`),
    );
    let bookmarkNotifications = 0;
    let feedNotifications = 0;
    const unsubscribeBookmarks = bookmarksStore.subscribe(
      () => bookmarkNotifications++,
    );
    const unsubscribeFeedItems = feedItemsStore.subscribe(
      () => feedNotifications++,
    );

    applyRequestedMixedContentPage({
      scope: { type: "view", viewId: 10 },
      contentStatus: { saveStatus: "saved", archiveStatus: "unread" },
      page: {
        ...page(bookmarks.map((item) => reference("bookmark", item.id))),
        bookmarks,
        feedItems: items,
      },
      replacesScope: true,
    });

    unsubscribeBookmarks();
    unsubscribeFeedItems();
    expect(bookmarkNotifications).toBe(1);
    expect(feedNotifications).toBe(1);
  });

  it("reprojects loaded mixed Views when a Feed item descriptor changes", () => {
    const videosView = { ...view(), contentFilter: 2 as const };
    const shortsView = {
      ...view(),
      id: 11,
      name: "Shorts",
      contentFilter: 4 as const,
    };
    viewsStore.getState().set([videosView, shortsView]);
    const horizontal = {
      ...feedItem("changing-video", "https://example.com/video"),
      contentType: "video" as const,
      orientation: "horizontal" as const,
    };
    feedItemsStore.getState().setFeedItem(horizontal.id, horizontal);
    for (const target of [videosView, shortsView]) {
      mixedContentStore.getState().applyPage({
        scope: { type: "view", viewId: target.id },
        contentStatus: { saveStatus: "inbox", archiveStatus: "unread" },
        page: page(
          target.id === videosView.id
            ? [reference("feed-item", horizontal.id)]
            : [],
        ),
        replacesScope: true,
      });
    }

    const vertical = {
      ...horizontal,
      orientation: "vertical" as const,
      updatedAt: new Date(NOW.getTime() + 1),
    };
    const affected = processPublishedChunks([
      {
        source: "rss",
        chunk: {
          type: "feed-items",
          feedId: vertical.feedId,
          feedItems: [vertical],
        },
      },
    ]);

    expect(
      affected
        .map((scope) => getMixedScopeKey(scope.scope, scope.contentStatus))
        .sort(),
    ).toEqual(["view:10:inbox:unread", "view:11:inbox:unread"]);
    expect(
      mixedContentStore.getState().scopes["view:10:inbox:unread"]?.references,
    ).toEqual([]);
    expect(
      mixedContentStore.getState().scopes["view:11:inbox:unread"]?.references,
    ).toEqual([reference("feed-item", vertical.id)]);
  });

  it("keeps a reprojected Feed item when it matches a cached Bookmark", () => {
    const cached = bookmark({
      id: "global-collision",
      canonicalUrl: "https://example.com/collision",
      viewIds: [],
    });
    const original = feedItem(
      "changing-collision",
      "https://example.com/original",
    );
    bookmarksStore.getState().upsert(cached);
    feedItemsStore.getState().setFeedItem(original.id, original);
    mixedContentStore.getState().applyPage({
      scope: { type: "view", viewId: 10 },
      contentStatus: { saveStatus: "inbox", archiveStatus: "unread" },
      page: page([reference("feed-item", original.id)]),
      replacesScope: true,
    });

    const colliding = {
      ...original,
      url: cached.canonicalUrl,
      updatedAt: new Date(NOW.getTime() + 1),
    };
    processPublishedChunks([
      {
        source: "rss",
        chunk: {
          type: "feed-items",
          feedId: colliding.feedId,
          feedItems: [colliding],
        },
      },
    ]);

    expect(
      mixedContentStore.getState().scopes["view:10:inbox:unread"]?.references,
    ).toEqual([reference("feed-item", colliding.id)]);
  });

  it("reprojects cached Feed items immediately after a View filter edit", () => {
    const horizontal = {
      ...feedItem("horizontal", "https://example.com/horizontal"),
      contentType: "video" as const,
      orientation: "horizontal" as const,
    };
    const vertical = {
      ...feedItem("vertical", "https://example.com/vertical"),
      contentType: "video" as const,
      orientation: "vertical" as const,
    };
    feedItemsStore.getState().setFeedItems([horizontal, vertical]);
    mixedContentStore.getState().applyPage({
      scope: { type: "view", viewId: 10 },
      contentStatus: { saveStatus: "inbox", archiveStatus: "unread" },
      page: page([reference("feed-item", horizontal.id)]),
      replacesScope: true,
    });

    const shortsView = { ...view(), contentFilter: 4 as const };
    viewsStore.getState().set([shortsView]);
    const feedItems = feedItemsStore.getState().feedItemsDict;
    mixedContentStore.getState().reprojectFeedItems({
      itemIds: Object.keys(feedItems),
      feedItems,
      views: [shortsView],
      feedCategories: [],
    });

    expect(
      mixedContentStore.getState().scopes["view:10:inbox:unread"]?.references,
    ).toEqual([reference("feed-item", vertical.id)]);
  });

  it("moves Bookmark content status without changing matching Feed rows", () => {
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
    const existing = bookmark({ isSaved: false });
    bookmarksStore.getState().upsert(existing);
    const scope = { type: "view" as const, viewId: 10 };
    mixedContentStore.getState().applyPage({
      scope,
      contentStatus: { saveStatus: "inbox", archiveStatus: "unread" },
      page: page([
        reference("bookmark", existing.id),
        reference("feed-item", matchingOne.id),
        reference("feed-item", matchingTwo.id),
        reference("feed-item", other.id),
      ]),
      replacesScope: true,
    });
    mixedContentStore.getState().applyPage({
      scope,
      contentStatus: { saveStatus: "inbox", archiveStatus: "archived" },
      page: page([]),
      replacesScope: true,
    });
    mixedContentStore.getState().applyPage({
      scope,
      contentStatus: { saveStatus: "saved", archiveStatus: "unread" },
      page: page([]),
      replacesScope: true,
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
      mixedContentStore.getState().scopes[
        getMixedScopeKey(scope, {
          saveStatus: "inbox",
          archiveStatus: "unread",
        })
      ]?.references,
    ).toEqual([
      reference("feed-item", other.id),
      reference("feed-item", matchingTwo.id),
      reference("feed-item", matchingOne.id),
    ]);
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
      mixedContentStore.getState().scopes[
        getMixedScopeKey(scope, {
          saveStatus: "inbox",
          archiveStatus: "archived",
        })
      ]?.references,
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
    expect(affectedOnDelete).toHaveLength(1);
    expect(
      mixedContentStore.getState().scopes[
        getMixedScopeKey(scope, {
          saveStatus: "inbox",
          archiveStatus: "unread",
        })
      ]?.references,
    ).toEqual([
      reference("feed-item", other.id),
      reference("feed-item", matchingTwo.id),
      reference("feed-item", matchingOne.id),
    ]);
  });

  it("commits a bulk Bookmark upsert with one entity-store notification", () => {
    const first = bookmark({ id: "batch-one" });
    const second = bookmark({ id: "batch-two" });
    mixedContentStore.getState().applyPage({
      scope: { type: "view", viewId: 10 },
      contentStatus: { saveStatus: "saved", archiveStatus: "unread" },
      page: page([
        reference("bookmark", first.id),
        reference("bookmark", second.id),
      ]),
      replacesScope: true,
    });
    let notifications = 0;
    const unsubscribe = bookmarksStore.subscribe(() => notifications++);

    processPublishedChunks([
      {
        source: "bookmark",
        chunk: {
          type: "bookmark-upsert-batch",
          bookmarks: [first, second],
        },
      },
    ]);

    unsubscribe();
    expect(notifications).toBe(1);
    expect(bookmarksStore.getState().snapshot()).toMatchObject({
      [first.id]: first,
      [second.id]: second,
    });
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
      contentStatus: { saveStatus: "inbox", archiveStatus: "unread" },
      page: page(references),
      replacesScope: true,
    });
    mixedContentStore.getState().applyPage({
      scope,
      contentStatus: { saveStatus: "inbox", archiveStatus: "archived" },
      page: page([]),
      replacesScope: true,
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
      mixedContentStore.getState().scopes[
        getMixedScopeKey(scope, {
          saveStatus: "inbox",
          archiveStatus: "unread",
        })
      ]?.references,
    ).toEqual([]);
    expect(
      mixedContentStore.getState().scopes[
        getMixedScopeKey(scope, {
          saveStatus: "inbox",
          archiveStatus: "archived",
        })
      ]?.references.map(({ entityId }) => entityId),
    ).toEqual([archivedBookmark.id, item.id]);

    await setMixedReadValue({ references, isRead: false });
    expect(
      bookmarksStore.getState().getBookmark(archivedBookmark.id)?.isRead,
    ).toBe(false);
    expect(feedItemsStore.getState().feedItemsDict[item.id]?.isWatched).toBe(
      false,
    );
    expect(
      mixedContentStore.getState().scopes[
        getMixedScopeKey(scope, {
          saveStatus: "inbox",
          archiveStatus: "unread",
        })
      ]?.references.map(({ entityId }) => entityId),
    ).toEqual([archivedBookmark.id, item.id]);
    expect(
      mixedContentStore.getState().scopes[
        getMixedScopeKey(scope, {
          saveStatus: "inbox",
          archiveStatus: "archived",
        })
      ]?.references,
    ).toEqual([]);
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
      contentStatus: { saveStatus: "inbox", archiveStatus: "unread" },
      page: page(references),
      replacesScope: true,
    });
    mixedContentStore.getState().applyPage({
      scope,
      contentStatus: { saveStatus: "inbox", archiveStatus: "archived" },
      page: page([]),
      replacesScope: true,
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
      mixedContentStore.getState().scopes[
        getMixedScopeKey(scope, {
          saveStatus: "inbox",
          archiveStatus: "unread",
        })
      ]?.references,
    ).toEqual(references);
    expect(
      mixedContentStore.getState().scopes[
        getMixedScopeKey(scope, {
          saveStatus: "inbox",
          archiveStatus: "archived",
        })
      ]?.references,
    ).toEqual([]);
  });
});
