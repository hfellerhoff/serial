import { serialize } from "node:v8";
import { performance } from "node:perf_hooks";
import { BENCHMARK_PROFILES } from "./model";
import type { BenchmarkProfileName } from "./model";
import type { VisibilityFilter } from "~/lib/data/atoms";
import type { ApplicationFeedItem, ApplicationView } from "~/server/db/schema";
import type {
  ApplicationBookmark,
  MixedContentReference,
} from "~/server/mixed-content/projection";
import type { PublishedChunk } from "~/server/api/publisher";
import { bookmarksStore } from "~/lib/data/bookmarks/store";
import { feedItemsStore } from "~/lib/data/store";
import { mixedContentStore } from "~/lib/data/mixed-content/store";
import { processPublishedChunks } from "~/lib/data/subscriptionCoordinator";
import { viewsStore } from "~/lib/data/views/store";
import {
  BOOKMARK_SYNC_REQUEST_BUDGET_BYTES,
  BOOKMARK_SYNC_RESPONSE_BUDGET_BYTES,
  buildBookmarkSyncManifest,
} from "~/lib/data/bookmarks/manifest";
import {
  buildBookmarkSyncPages,
  computeChangedBookmarkSyncBuckets,
} from "~/server/mixed-content/sync";
import { NORMALIZED_ARRAY_CHUNK_SIZE } from "~/lib/data/normalized-idb-storage";
import {
  CLIENT_PAGE_RETENTION_BUDGETS,
  getBoundedItemWindow,
  selectPersistedPages,
} from "~/lib/data/page-retention";

const PAGE_SIZE = 30;
const VISIBILITIES: VisibilityFilter[] = ["unread", "read", "later"];
const FIXTURE_TIME = new Date("2026-01-15T12:00:00.000Z");
const NORMALIZED_PERSISTENCE_MUTATION_BUDGET_BYTES = 512 * 1_024;

export const CLIENT_OPERATION_DURATION_BUDGET_MS = 50;

export type ClientAuditOperation = {
  durationMs: number;
  heapDeltaBytes: number;
  bookmarkStoreNotifications: number;
  feedItemStoreNotifications: number;
  feedItemProjectionNotifications: number;
  feedItemScopeNotifications: number;
  mixedStoreNotifications: number;
  authoritativeRefills: number;
};

export type ClientAuditResult = {
  profile: BenchmarkProfileName;
  fixture: {
    feedItems: number;
    bookmarks: number;
    views: number;
    loadedMixedScopes: number;
    referencesPerScope: number;
  };
  persistedPayloadBytes: {
    application: number;
    bookmarks: number;
    mixedContent: number;
    total: number;
  };
  synchronizationBytes: {
    request: number;
    maximumResponsePage: number;
    requestBudget: number;
    responseBudget: number;
  };
  persistenceMutationBytes: {
    measured: number;
    budget: number;
  };
  retention: {
    budgets: {
      memoryPages: number;
      memoryBytes: number;
      indexedDbPages: number;
      indexedDbBytes: number;
      mountedItems: number;
    };
    afterTwelvePages: RetentionPlateauMetrics;
    afterTwentyFourPages: RetentionPlateauMetrics;
  };
  operations: {
    bookmarkSave: ClientAuditOperation;
    bookmarkProgressEvent: ClientAuditOperation;
    bookmarkCaptureEvent: ClientAuditOperation;
    bookmarkOrganizationChange: ClientAuditOperation;
    bookmarkDelete: ClientAuditOperation;
    feedProgressEvent: ClientAuditOperation;
    feedProgressBurst: ClientAuditOperation;
    bookmarkBurstSingleFrame: ClientAuditOperation;
    bookmarkBurstSeparateFrames: ClientAuditOperation;
    coldSynchronization: ClientAuditOperation;
    warmSynchronization: ClientAuditOperation;
    normalizedPersistenceMutation: ClientAuditOperation;
  };
};

export function evaluateClientAuditOperationBudgets(result: ClientAuditResult) {
  return Object.entries(result.operations).flatMap(([operation, metrics]) =>
    metrics.durationMs > CLIENT_OPERATION_DURATION_BUDGET_MS
      ? [
          `${operation}: ${metrics.durationMs.toFixed(1)}ms > ${CLIENT_OPERATION_DURATION_BUDGET_MS}ms`,
        ]
      : [],
  );
}

type RetentionPlateauMetrics = {
  pages: number;
  entities: number;
  scopeReferences: number;
  retainedBytes: number;
  retainedHeapBytes: number;
  persistedPages: number;
  persistedBytes: number;
  mountedItems: number;
};

function makeBookmark(index: number): ApplicationBookmark {
  const date = new Date(FIXTURE_TIME.getTime() - index * 1_000);
  return {
    id: `audit-bookmark-${index}`,
    userId: "audit-user",
    sourceUrl: `https://bookmarks.serial.test/${index}`,
    canonicalUrl: `https://bookmarks.serial.test/${index}`,
    isSaved: index % 5 === 0,
    isRead: index % 5 > 2,
    progress: index % 101,
    duration: 100,
    savedUpdatedAt: date,
    readUpdatedAt: date,
    progressUpdatedAt: date,
    createdAt: date,
    updatedAt: date,
    title: `Audit bookmark ${index}`,
    author: "Serial audit",
    publishedAt: date,
    effectiveUrl: `https://bookmarks.serial.test/${index}`,
    iconUrl: null,
    representativeImageUrl: null,
    captureHash: `bookmark-hash-${index}`,
    capturedAt: date,
    viewIds: [index % 25],
    tagIds: [index % 25],
  };
}

function makeFeedItem(index: number): ApplicationFeedItem {
  const date = new Date(FIXTURE_TIME.getTime() - index * 1_000);
  return {
    id: `audit-feed-item-${index}`,
    feedId: (index % 100) + 1,
    contentId: `audit-${index}`,
    title: `Audit feed item ${index}`,
    author: "Serial audit",
    url: `https://feeds.serial.test/${index}`,
    thumbnail: "",
    content: `<p>Audit body ${index}</p>`,
    contentSnippet: `Audit summary ${index}`,
    isWatched: index % 5 > 2,
    isWatchLater: index % 5 === 0,
    progress: index % 101,
    duration: 100,
    orientation: "horizontal",
    platform: "website",
    postedAt: date,
    createdAt: date,
    updatedAt: date,
    isWatchedUpdatedAt: date,
    isWatchLaterUpdatedAt: date,
    contentHash: `feed-hash-${index}`,
  };
}

function makeView(index: number): ApplicationView {
  return {
    id: index,
    userId: "audit-user",
    name: `Audit view ${index}`,
    daysWindow: 0,
    readStatus: 0,
    orientation: "horizontal",
    contentType: "all",
    layout: "list",
    placement: index,
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME,
    isDefault: false,
    categoryIds: index === -1 ? [] : [index],
    feedIds: index === -1 ? [] : [index + 1],
    viewSections: [],
  };
}

function feedReference(index: number): MixedContentReference {
  return {
    entityKind: "feed-item",
    entityId: `audit-feed-item-${index}`,
    sectionPlacement: null,
    normalizedAt: new Date(FIXTURE_TIME.getTime() - index * 1_000),
  };
}

function resetStores() {
  bookmarksStore.getState().reset();
  mixedContentStore.getState().reset();
  feedItemsStore.getState().reset();
}

function seedClientFixture(profileName: BenchmarkProfileName) {
  resetStores();
  const profile = BENCHMARK_PROFILES[profileName];
  const views = [
    makeView(-1),
    ...Array.from({ length: profile.views }, (_, index) => makeView(index)),
  ];
  viewsStore.setState({
    views,
    viewsDict: Object.fromEntries(views.map((view) => [view.id, view])),
    fetchStatus: "success",
  });

  const bookmarks = Array.from({ length: profile.bookmarks }, (_, index) => ({
    ...makeBookmark(index),
    viewIds: [index % profile.views],
    tagIds: [index % profile.views],
  }));
  bookmarksStore
    .getState()
    .replace(
      Object.fromEntries(bookmarks.map((bookmark) => [bookmark.id, bookmark])),
    );

  const feedItems = Array.from({ length: profile.feedItems }, (_, index) =>
    makeFeedItem(index),
  );
  const feedItemsDict = Object.fromEntries(
    feedItems.map((item) => [item.id, item]),
  );
  feedItemsStore.setState({
    feedItemsDict,
    feedItemsOrder: feedItems.map((item) => item.id),
    feedItemProjectionRevision: 0,
    hasInitialData: true,
  });

  for (const view of views) {
    for (const visibility of VISIBILITIES) {
      const offset =
        (view.id * VISIBILITIES.length + VISIBILITIES.indexOf(visibility)) *
        PAGE_SIZE;
      const references = Array.from({ length: PAGE_SIZE }, (_, index) =>
        feedReference((offset + index) % profile.feedItems),
      );
      const scopedBookmark =
        view.id === -1
          ? undefined
          : bookmarks.find(
              (bookmark) =>
                bookmark.viewIds.includes(view.id) &&
                (bookmark.isSaved
                  ? visibility === "later"
                  : bookmark.isRead
                    ? visibility === "read"
                    : visibility === "unread"),
            );
      if (scopedBookmark) {
        references[references.length - 1] = {
          entityKind: "bookmark",
          entityId: scopedBookmark.id,
          sectionPlacement: null,
          normalizedAt:
            visibility === "later"
              ? scopedBookmark.savedUpdatedAt
              : visibility === "read"
                ? scopedBookmark.readUpdatedAt
                : scopedBookmark.createdAt,
        };
      }
      mixedContentStore.getState().applyPage({
        scope: { type: "view", viewId: view.id },
        visibility,
        page: {
          references,
          bookmarks: scopedBookmark ? [scopedBookmark] : [],
          feedItems: [],
          cursor: null,
          hasMore: true,
        },
        replacesScope: true,
        feedItems: feedItemsDict,
      });
    }
  }

  return { profile, bookmarks, feedItems, views };
}

function measure(operation: () => number): ClientAuditOperation {
  let bookmarkStoreNotifications = 0;
  let feedItemStoreNotifications = 0;
  let feedItemProjectionNotifications = 0;
  let feedItemScopeNotifications = 0;
  let mixedStoreNotifications = 0;
  let previousProjectionRevision =
    feedItemsStore.getState().feedItemProjectionRevision;
  let previousScopeFeedItemIds = feedItemsStore.getState().scopeFeedItemIds;
  const unsubscribers = [
    bookmarksStore.subscribe(() => bookmarkStoreNotifications++),
    feedItemsStore.subscribe((state) => {
      feedItemStoreNotifications++;
      if (state.feedItemProjectionRevision !== previousProjectionRevision) {
        feedItemProjectionNotifications++;
        previousProjectionRevision = state.feedItemProjectionRevision;
      }
      if (state.scopeFeedItemIds !== previousScopeFeedItemIds) {
        feedItemScopeNotifications++;
        previousScopeFeedItemIds = state.scopeFeedItemIds;
      }
    }),
    mixedContentStore.subscribe(() => mixedStoreNotifications++),
  ];
  const heapBefore = process.memoryUsage().heapUsed;
  const startedAt = performance.now();
  const authoritativeRefills = operation();
  const durationMs = performance.now() - startedAt;
  const heapDeltaBytes = process.memoryUsage().heapUsed - heapBefore;
  for (const unsubscribe of unsubscribers) unsubscribe();
  return {
    durationMs,
    heapDeltaBytes,
    bookmarkStoreNotifications,
    feedItemStoreNotifications,
    feedItemProjectionNotifications,
    feedItemScopeNotifications,
    mixedStoreNotifications,
    authoritativeRefills,
  };
}

function bookmarkUpsertPayload(bookmark: ApplicationBookmark): PublishedChunk {
  return {
    source: "bookmark",
    chunk: { type: "bookmark-upsert", bookmark },
  };
}

function updatedBookmark(bookmark: ApplicationBookmark, progress: number) {
  const updatedAt = new Date(
    bookmark.progressUpdatedAt.getTime() + progress + 1,
  );
  return {
    ...bookmark,
    progress,
    progressUpdatedAt: updatedAt,
    updatedAt,
  };
}

function normalizedPersistenceMutationPayload() {
  return {
    feedItem: Object.values(feedItemsStore.getState().feedItemsDict)[0],
    bookmark: Object.values(bookmarksStore.getState().snapshot())[0],
    mixedScope: Object.values(mixedContentStore.getState().scopes)[0],
    orderChunk: feedItemsStore
      .getState()
      .feedItemsOrder.slice(0, NORMALIZED_ARRAY_CHUNK_SIZE),
  };
}

function measureNormalizedPersistenceMutation() {
  return measure(() => {
    structuredClone(normalizedPersistenceMutationPayload());
    return 0;
  });
}

function persistedPayloadBytes() {
  const application = serialize({
    feedItemsDict: feedItemsStore.getState().feedItemsDict,
    feedItemsOrder: feedItemsStore.getState().feedItemsOrder,
  }).byteLength;
  const bookmarks = serialize({
    bookmarksDict: bookmarksStore.getState().snapshot(),
  }).byteLength;
  const mixedContent = serialize({
    scopes: mixedContentStore.getState().scopes,
    suppressedReferences: mixedContentStore.getState().suppressedReferences,
  }).byteLength;
  return {
    application,
    bookmarks,
    mixedContent,
    total: application + bookmarks + mixedContent,
  };
}

function measureRetentionPlateau(pageCount: number): RetentionPlateauMetrics {
  resetStores();
  const scopeKey = "view:1:unread";
  let requestCursor: { postedAt: Date; id: string } | null = null;
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const pageItems = Array.from({ length: PAGE_SIZE }, (_, itemIndex) =>
      makeFeedItem(pageIndex * PAGE_SIZE + itemIndex),
    );
    const state = feedItemsStore.getState();
    feedItemsStore.setState({
      feedItemsDict: {
        ...state.feedItemsDict,
        ...Object.fromEntries(pageItems.map((item) => [item.id, item])),
      },
      feedItemsOrder: [
        ...state.feedItemsOrder,
        ...pageItems.map((item) => item.id),
      ],
    });
    const nextCursor = {
      postedAt: pageItems[pageItems.length - 1]!.postedAt,
      id: pageItems[pageItems.length - 1]!.id,
    };
    feedItemsStore.getState().retainFeedItemPage({
      scopeKey,
      itemIds: pageItems.map((item) => item.id),
      requestCursor,
      nextCursor,
      replacesScope: pageIndex === 0,
    });
    requestCursor = nextCursor;
  }

  const state = feedItemsStore.getState();
  const pages = state.retainedFeedPages[scopeKey] ?? [];
  const persistedPages = selectPersistedPages(pages);
  const persistedEntityIds = new Set(
    persistedPages.flatMap((page) => page.entityIds),
  );
  const persistedBytes = serialize({
    pages: persistedPages,
    feedItems: Object.fromEntries(
      Object.entries(state.feedItemsDict).filter(([id]) =>
        persistedEntityIds.has(id),
      ),
    ),
  }).byteLength;
  const scopeReferences = state.scopeFeedItemIds[scopeKey] ?? [];
  return {
    pages: pages.length,
    entities: Object.keys(state.feedItemsDict).length,
    scopeReferences: scopeReferences.length,
    retainedBytes: state.retainedFeedPageBytes,
    retainedHeapBytes: serialize({
      feedItemsDict: state.feedItemsDict,
      feedItemsOrder: state.feedItemsOrder,
      scopeReferences,
      pages,
    }).byteLength,
    persistedPages: persistedPages.length,
    persistedBytes,
    mountedItems: getBoundedItemWindow({
      itemIds: scopeReferences,
      renderEnd: scopeReferences.length,
      selectedItemId: null,
    }).itemIds.length,
  };
}

export function runClientAuditProfile(
  profileName: BenchmarkProfileName,
): ClientAuditResult {
  let fixture = seedClientFixture(profileName);
  const profile = fixture.profile;
  const bookmarkSave = measure(
    () =>
      processPublishedChunks([
        bookmarkUpsertPayload({
          ...makeBookmark(profile.bookmarks + 1),
          id: "audit-bookmark-new",
          isSaved: true,
          isRead: false,
          viewIds: [profile.views - 1],
          tagIds: [profile.views - 1],
        }),
      ]).length,
  );

  fixture = seedClientFixture(profileName);
  const baseBookmark = fixture.bookmarks[0]!;
  const bookmarkProgressEvent = measure(
    () =>
      processPublishedChunks([
        bookmarkUpsertPayload(updatedBookmark(baseBookmark, 1)),
      ]).length,
  );

  fixture = seedClientFixture(profileName);
  const captureBookmark = fixture.bookmarks[0]!;
  const bookmarkCaptureEvent = measure(
    () =>
      processPublishedChunks([
        bookmarkUpsertPayload({
          ...captureBookmark,
          title: "Updated capture title",
          captureHash: "updated-capture-hash",
          capturedAt: new Date(FIXTURE_TIME.getTime() + 1),
          updatedAt: new Date(FIXTURE_TIME.getTime() + 1),
        }),
      ]).length,
  );

  fixture = seedClientFixture(profileName);
  const bookmarkOrganizationChange = measure(
    () =>
      processPublishedChunks([
        bookmarkUpsertPayload({
          ...fixture.bookmarks[0]!,
          viewIds: [profile.views - 1],
          tagIds: [profile.views - 1],
          updatedAt: new Date(FIXTURE_TIME.getTime() + 1),
        }),
      ]).length,
  );

  fixture = seedClientFixture(profileName);
  const bookmarkDelete = measure(
    () =>
      processPublishedChunks([
        {
          source: "bookmark",
          chunk: {
            type: "bookmark-delete",
            id: fixture.bookmarks[0]!.id,
            canonicalUrl: fixture.bookmarks[0]!.canonicalUrl,
          },
        },
      ]).length,
  );

  fixture = seedClientFixture(profileName);
  const feedProgressEvent = measure(() => {
    const item = fixture.feedItems[0]!;
    feedItemsStore.getState().setFeedItem(item.id, {
      ...item,
      progress: (item.progress ?? 0) + 1,
    });
    return 0;
  });

  fixture = seedClientFixture(profileName);
  const feedProgressBurst = measure(() => {
    feedItemsStore.getState().setFeedItems(
      fixture.feedItems.slice(0, 100).map((item) => ({
        ...item,
        progress: (item.progress ?? 0) + 1,
      })),
    );
    return 0;
  });

  fixture = seedClientFixture(profileName);
  const bookmarkBurst = Array.from({ length: 100 }, (_, index) =>
    bookmarkUpsertPayload(
      updatedBookmark(
        fixture.bookmarks[index % fixture.bookmarks.length]!,
        index,
      ),
    ),
  );
  const bookmarkBurstSingleFrame = measure(
    () => processPublishedChunks(bookmarkBurst).length,
  );

  fixture = seedClientFixture(profileName);
  const bookmarkBurstSeparateFrames = measure(() => {
    let refills = 0;
    for (const payload of bookmarkBurst) {
      refills += processPublishedChunks([payload]).length;
    }
    return refills;
  });

  fixture = seedClientFixture(profileName);
  const changedBuckets = computeChangedBookmarkSyncBuckets(
    fixture.bookmarks,
    [],
  );
  const bookmarkSyncPages = changedBuckets.flatMap(buildBookmarkSyncPages);
  const coldSynchronizationPayloads: PublishedChunk[] = bookmarkSyncPages.map(
    (chunk) => ({ source: "bookmark", chunk }),
  );
  resetStores();
  viewsStore.setState({
    views: fixture.views,
    viewsDict: Object.fromEntries(fixture.views.map((view) => [view.id, view])),
    fetchStatus: "success",
  });
  const coldSynchronization = measure(() => {
    processPublishedChunks(coldSynchronizationPayloads);
    return 0;
  });

  fixture = seedClientFixture(profileName);
  const requestManifest = buildBookmarkSyncManifest(fixture.bookmarks);
  const warmSynchronization = measure(() => {
    const unchangedBuckets = computeChangedBookmarkSyncBuckets(
      fixture.bookmarks,
      requestManifest,
    );
    processPublishedChunks(
      unchangedBuckets
        .flatMap(buildBookmarkSyncPages)
        .map((chunk) => ({ source: "bookmark" as const, chunk })),
    );
    return 0;
  });
  const payloadBytes = persistedPayloadBytes();
  const normalizedPersistenceMutation = measureNormalizedPersistenceMutation();
  const persistenceMutationBytes = serialize(
    normalizedPersistenceMutationPayload(),
  ).byteLength;
  const responsePageBytes = bookmarkSyncPages.map((page) =>
    Buffer.byteLength(JSON.stringify(page)),
  );
  const afterTwelvePages = measureRetentionPlateau(12);
  const afterTwentyFourPages = measureRetentionPlateau(24);

  return {
    profile: profileName,
    fixture: {
      feedItems: profile.feedItems,
      bookmarks: profile.bookmarks,
      views: profile.views,
      loadedMixedScopes: (profile.views + 1) * VISIBILITIES.length,
      referencesPerScope: PAGE_SIZE,
    },
    persistedPayloadBytes: payloadBytes,
    synchronizationBytes: {
      request: Buffer.byteLength(JSON.stringify(requestManifest)),
      maximumResponsePage: Math.max(0, ...responsePageBytes),
      requestBudget: BOOKMARK_SYNC_REQUEST_BUDGET_BYTES,
      responseBudget: BOOKMARK_SYNC_RESPONSE_BUDGET_BYTES,
    },
    persistenceMutationBytes: {
      measured: persistenceMutationBytes,
      budget: NORMALIZED_PERSISTENCE_MUTATION_BUDGET_BYTES,
    },
    retention: {
      budgets: {
        memoryPages: CLIENT_PAGE_RETENTION_BUDGETS.memory.maxPages,
        memoryBytes: CLIENT_PAGE_RETENTION_BUDGETS.memory.maxBytes,
        indexedDbPages: CLIENT_PAGE_RETENTION_BUDGETS.indexedDb.maxPages,
        indexedDbBytes: CLIENT_PAGE_RETENTION_BUDGETS.indexedDb.maxBytes,
        mountedItems: CLIENT_PAGE_RETENTION_BUDGETS.mountedItems,
      },
      afterTwelvePages,
      afterTwentyFourPages,
    },
    operations: {
      bookmarkSave,
      bookmarkProgressEvent,
      bookmarkCaptureEvent,
      bookmarkOrganizationChange,
      bookmarkDelete,
      feedProgressEvent,
      feedProgressBurst,
      bookmarkBurstSingleFrame,
      bookmarkBurstSeparateFrames,
      coldSynchronization,
      warmSynchronization,
      normalizedPersistenceMutation,
    },
  };
}
