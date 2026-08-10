import { getReconciliationScopeKey } from "./contracts";
import type {
  ActiveFirstPageResult,
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

export type ReconciliationDataState = {
  organization: OrganizationSnapshot | null;
  navigation: NavigationSnapshot | null;
  feedItems: Record<string, ApplicationFeedItem>;
  bookmarks: Record<string, ApplicationBookmark>;
  scopes: Record<string, ReconciledScope>;
};

export type ReconciliationDataEvent =
  | { type: "apply-organization"; snapshot: OrganizationSnapshot }
  | { type: "apply-navigation"; snapshot: NavigationSnapshot }
  | {
      type: "apply-active-first-page";
      page: ActiveFirstPageResult;
      currentMembershipRevision: number;
    };

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
  }
}
