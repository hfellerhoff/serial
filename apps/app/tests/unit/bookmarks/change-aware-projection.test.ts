import { beforeEach, describe, expect, it } from "vitest";
import type { ApplicationView } from "~/server/db/schema";
import type {
  ApplicationBookmark,
  MixedContentPage,
  MixedContentReference,
  MixedContentScope,
} from "~/server/mixed-content/projection";
import type { PublishedChunk } from "~/server/api/publisher";
import { bookmarksStore } from "~/lib/data/bookmarks/store";
import { feedItemsStore } from "~/lib/data/store";
import {
  getMixedScopeKey,
  mixedContentStore,
} from "~/lib/data/mixed-content/store";
import { viewsStore } from "~/lib/data/views/store";
import { processPublishedChunks } from "~/lib/data/subscriptionCoordinator";

const NOW = new Date("2026-07-31T12:00:00.000Z");

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

function view(id: number, overrides: Partial<ApplicationView> = {}) {
  return {
    id,
    userId: "user-one",
    name: `View ${id}`,
    daysWindow: 0,
    readStatus: 0,
    orientation: "horizontal",
    contentType: "longform",
    layout: "list",
    placement: id,
    createdAt: NOW,
    updatedAt: NOW,
    categoryIds: [],
    feedIds: [id],
    isDefault: false,
    viewSections: [],
    ...overrides,
  } satisfies ApplicationView;
}

function reference(
  entityId: string,
  normalizedAt = NOW,
  sectionPlacement: number | null = null,
): MixedContentReference {
  return {
    entityKind: "bookmark",
    entityId,
    sectionPlacement,
    normalizedAt,
  };
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

function loadScope(
  scope: MixedContentScope,
  visibility: "unread" | "read" | "later",
  references: MixedContentReference[] = [],
) {
  mixedContentStore.getState().applyPage({
    scope,
    visibility,
    page: page(references),
    replacesScope: true,
    feedItems: feedItemsStore.getState().feedItemsDict,
  });
}

function upsertPayload(nextBookmark: ApplicationBookmark): PublishedChunk {
  return {
    source: "bookmark",
    chunk: { type: "bookmark-upsert", bookmark: nextBookmark },
  };
}

beforeEach(() => {
  bookmarksStore.getState().reset();
  feedItemsStore.getState().reset();
  mixedContentStore.getState().reset();
  viewsStore.getState().set([view(10), view(11), view(12)]);
});

describe("change-aware Bookmark projection", () => {
  it("patches progress and capture metadata without mixed projection work", () => {
    const saved = bookmark();
    bookmarksStore.getState().upsert(saved);
    for (const targetView of [10, 11, 12]) {
      for (const visibility of ["unread", "read", "later"] as const) {
        loadScope(
          { type: "view", viewId: targetView },
          visibility,
          targetView === 10 && visibility === "later"
            ? [reference(saved.id)]
            : [],
        );
      }
    }

    let mixedNotifications = 0;
    const unsubscribe = mixedContentStore.subscribe(() => mixedNotifications++);
    const progressAt = new Date(NOW.getTime() + 1);
    const progressResult = processPublishedChunks([
      upsertPayload({
        ...saved,
        progress: 8,
        progressUpdatedAt: progressAt,
        updatedAt: progressAt,
      }),
    ]);
    const captureAt = new Date(NOW.getTime() + 2);
    const captureResult = processPublishedChunks([
      upsertPayload({
        ...bookmarksStore.getState().getBookmark(saved.id)!,
        title: "Fresh capture",
        captureHash: "fresh-hash",
        capturedAt: captureAt,
        updatedAt: captureAt,
      }),
    ]);
    unsubscribe();

    expect(progressResult).toEqual([]);
    expect(captureResult).toEqual([]);
    expect(mixedNotifications).toBe(0);
    expect(bookmarksStore.getState().getBookmark(saved.id)).toMatchObject({
      progress: 8,
      title: "Fresh capture",
      captureHash: "fresh-hash",
    });
  });

  it("updates only old and new membership, visibility, and ordering scopes", () => {
    const saved = bookmark();
    bookmarksStore.getState().upsert(saved);
    for (const targetView of [10, 11, 12]) {
      for (const visibility of ["unread", "read", "later"] as const) {
        loadScope(
          { type: "view", viewId: targetView },
          visibility,
          targetView === 10 && visibility === "later"
            ? [reference(saved.id)]
            : [],
        );
      }
    }
    for (const visibility of ["unread", "read", "later"] as const) {
      loadScope({ type: "tag", tagId: 5 }, visibility);
    }

    const moved = bookmark({
      viewIds: [11],
      tagIds: [5],
      updatedAt: new Date(NOW.getTime() + 1),
    });
    const organizationScopes = processPublishedChunks([upsertPayload(moved)]);
    expect(
      organizationScopes
        .map((scope) => getMixedScopeKey(scope.scope, scope.visibility))
        .sort(),
    ).toEqual(["tag:5:later", "view:10:later", "view:11:later"]);

    const unread = bookmark({
      viewIds: [11],
      tagIds: [5],
      isSaved: false,
      updatedAt: new Date(NOW.getTime() + 2),
    });
    const visibilityScopes = processPublishedChunks([upsertPayload(unread)]);
    expect(
      visibilityScopes
        .map((scope) => getMixedScopeKey(scope.scope, scope.visibility))
        .sort(),
    ).toEqual([
      "tag:5:later",
      "tag:5:unread",
      "view:11:later",
      "view:11:unread",
    ]);

    const reorderedAt = new Date(NOW.getTime() + 3);
    const orderingScopes = processPublishedChunks([
      upsertPayload({
        ...unread,
        createdAt: reorderedAt,
        updatedAt: reorderedAt,
      }),
    ]);
    expect(
      orderingScopes
        .map((scope) => getMixedScopeKey(scope.scope, scope.visibility))
        .sort(),
    ).toEqual(["tag:5:unread", "view:11:unread"]);
    expect(
      mixedContentStore.getState().scopes["view:12:unread"]?.references,
    ).toEqual([]);
  });

  it("coalesces a same-frame entity-only burst without projection notifications", () => {
    const saved = bookmark();
    bookmarksStore.getState().upsert(saved);
    loadScope({ type: "view", viewId: 10 }, "later", [reference(saved.id)]);
    const burst = Array.from({ length: 100 }, (_, index) => {
      const changedAt = new Date(NOW.getTime() + index + 1);
      return upsertPayload({
        ...saved,
        progress: index,
        progressUpdatedAt: changedAt,
        updatedAt: changedAt,
      });
    });
    let mixedNotifications = 0;
    const unsubscribe = mixedContentStore.subscribe(() => mixedNotifications++);

    const affectedScopes = processPublishedChunks(burst);
    unsubscribe();

    expect(affectedScopes).toEqual([]);
    expect(mixedNotifications).toBe(0);
    expect(bookmarksStore.getState().getBookmark(saved.id)?.progress).toBe(99);
  });
});
