import { getReconciliationScopeKey } from "./contracts";
import type {
  ActiveFirstPageResult,
  BookmarkSyncPage,
  EntityDiff,
  OrganizationSnapshot,
  ReconciliationCursor,
  ReconciliationReference,
} from "./contracts";
import type { ApplicationFeedItem } from "~/server/db/schema";
import type { ApplicationBookmark } from "~/server/mixed-content/projection";
import type { NavigationSnapshot } from "~/server/navigation/snapshot";

export type ReconciledScope = {
  orderedRefs: ReconciliationReference[];
  cursor: ReconciliationCursor;
  hasMore: boolean;
  membershipRevision: number;
};

type PendingBookmarkBucket = {
  version: string;
  nextPageIndex: number;
  diffs: Array<EntityDiff<ApplicationBookmark>>;
};

export type ReconciliationDataState = {
  organization: OrganizationSnapshot | null;
  navigation: NavigationSnapshot | null;
  feedItems: Record<string, ApplicationFeedItem>;
  bookmarks: Record<string, ApplicationBookmark>;
  scopes: Record<string, ReconciledScope>;
  bookmarkBucketVersions: Record<number, string>;
  pendingBookmarkBuckets: Record<number, PendingBookmarkBucket>;
};

export type ReconciliationDataEvent =
  | { type: "apply-organization"; snapshot: OrganizationSnapshot }
  | { type: "apply-navigation"; snapshot: NavigationSnapshot }
  | {
      type: "apply-active-first-page";
      page: ActiveFirstPageResult;
      currentMembershipRevision: number;
    }
  | { type: "apply-bookmark-sync-page"; page: BookmarkSyncPage };

export type ReconciliationDataTransition = {
  state: ReconciliationDataState;
  applied: boolean;
};

export function createReconciliationDataState(
  initial: Partial<ReconciliationDataState> = {},
): ReconciliationDataState {
  return {
    organization: null,
    navigation: null,
    feedItems: {},
    bookmarks: {},
    scopes: {},
    bookmarkBucketVersions: {},
    pendingBookmarkBuckets: {},
    ...initial,
  };
}

export function applyEntityDiffs<TEntity extends { id: string }>(
  entities: Record<string, TEntity>,
  diffs: ReadonlyArray<EntityDiff<TEntity>>,
) {
  let next = entities;
  for (const diff of diffs) {
    if (diff.status === "unchanged") continue;
    if (next === entities) next = { ...entities };
    if (diff.status === "delete") {
      delete next[diff.id];
    } else {
      next[diff.entity.id] = diff.entity;
    }
  }
  return next;
}

function applyActiveFirstPage(
  state: ReconciliationDataState,
  page: ActiveFirstPageResult,
  currentMembershipRevision: number,
): ReconciliationDataTransition {
  if (page.membershipRevision !== currentMembershipRevision) {
    return { state, applied: false };
  }
  const scopeKey = getReconciliationScopeKey(page.target);
  return {
    applied: true,
    state: {
      ...state,
      feedItems: applyEntityDiffs(state.feedItems, page.feedItemDiffs),
      bookmarks: applyEntityDiffs(state.bookmarks, page.bookmarkDiffs),
      scopes: {
        ...state.scopes,
        [scopeKey]: {
          orderedRefs: page.orderedRefs,
          cursor: page.cursor,
          hasMore: page.hasMore,
          membershipRevision: page.membershipRevision,
        },
      },
    },
  };
}

function applyBookmarkSyncPage(
  state: ReconciliationDataState,
  page: BookmarkSyncPage,
): ReconciliationDataTransition {
  const current = state.pendingBookmarkBuckets[page.bucket];
  if (page.pageIndex !== 0 && !current) return { state, applied: false };
  if (
    page.pageIndex !== 0 &&
    current &&
    (current.version !== page.version ||
      current.nextPageIndex !== page.pageIndex)
  ) {
    return { state, applied: false };
  }
  const pending: PendingBookmarkBucket = {
    version: page.version,
    nextPageIndex: page.pageIndex + 1,
    diffs: [
      ...(page.pageIndex === 0 ? [] : (current?.diffs ?? [])),
      ...page.diffs,
    ],
  };
  if (!page.completesBucket) {
    return {
      applied: true,
      state: {
        ...state,
        pendingBookmarkBuckets: {
          ...state.pendingBookmarkBuckets,
          [page.bucket]: pending,
        },
      },
    };
  }
  const pendingBookmarkBuckets = { ...state.pendingBookmarkBuckets };
  delete pendingBookmarkBuckets[page.bucket];
  return {
    applied: true,
    state: {
      ...state,
      bookmarks: applyEntityDiffs(state.bookmarks, pending.diffs),
      bookmarkBucketVersions: {
        ...state.bookmarkBucketVersions,
        [page.bucket]: page.version,
      },
      pendingBookmarkBuckets,
    },
  };
}

export function reduceReconciliationData(
  state: ReconciliationDataState,
  event: ReconciliationDataEvent,
): ReconciliationDataTransition {
  switch (event.type) {
    case "apply-organization":
      return {
        applied: true,
        state: { ...state, organization: event.snapshot },
      };
    case "apply-navigation":
      return {
        applied: true,
        state: { ...state, navigation: event.snapshot },
      };
    case "apply-active-first-page":
      return applyActiveFirstPage(
        state,
        event.page,
        event.currentMembershipRevision,
      );
    case "apply-bookmark-sync-page":
      return applyBookmarkSyncPage(state, event.page);
  }
}
