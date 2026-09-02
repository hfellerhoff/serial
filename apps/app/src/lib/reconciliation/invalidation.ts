import type {
  ContentStatusFilter,
  ContentStatusKey,
} from "~/lib/content-status";
import type {
  ReconciliationScope,
  ReconciliationScopeTarget,
} from "./contracts";
import {
  buildContentStatusKey,
  CONTENT_STATUS_FILTERS,
} from "~/lib/content-status";
import { UNCATEGORIZED_VIEW_ID } from "~/lib/data/views/constants";

export const ALL_CONTENT_STATUS_KEYS = CONTENT_STATUS_FILTERS.map(
  buildContentStatusKey,
);

export type ReconciliationInvalidationDomain = "organization" | "navigation";

export type ReconciliationScopeSelector =
  | {
      type: "scopes";
      scopes: ReconciliationScope[];
      contentStatusKeys: ContentStatusKey[];
    }
  | {
      type: "feed-memberships";
      feedIds: number[];
      contentStatusKeys: ContentStatusKey[];
    }
  | {
      type: "bookmark-memberships";
      bookmarks: BookmarkInvalidationState[];
      contentStatusKeys: ContentStatusKey[];
    }
  | {
      type: "all-retained";
      contentStatusKeys: ContentStatusKey[];
    };

export type ReconciliationInvalidationSummary = {
  type: "reconciliation-invalidation";
  domains: ReconciliationInvalidationDomain[];
  scopeImpact:
    | { type: "known"; selectors: ReconciliationScopeSelector[] }
    | { type: "unknown" };
};

export type ReconciliationInvalidationMemberships = {
  views: Array<{ id: number; categoryIds: number[]; feedIds: number[] }>;
  viewFeedIds: Record<number, number[]>;
  feedCategories: Array<{ feedId: number; categoryId: number }>;
};

export type BookmarkInvalidationState = {
  isSaved: boolean;
  isRead: boolean;
  viewIds: number[];
  tagIds: number[];
};

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function sameScope(left: ReconciliationScope, right: ReconciliationScope) {
  if (left.type !== right.type) return false;
  if (left.type === "view" && right.type === "view") {
    return left.viewId === right.viewId;
  }
  if (left.type === "feed" && right.type === "feed") {
    return left.feedId === right.feedId;
  }
  return (
    left.type === "tag" && right.type === "tag" && left.tagId === right.tagId
  );
}

function selectorMatchesScope(
  selector: ReconciliationScopeSelector,
  target: ReconciliationScopeTarget,
  memberships: ReconciliationInvalidationMemberships,
) {
  if (
    !selector.contentStatusKeys.includes(
      buildContentStatusKey(target.contentStatus),
    )
  ) {
    return false;
  }
  if (selector.type === "all-retained") return true;
  if (selector.type === "scopes") {
    return selector.scopes.some((scope) => sameScope(scope, target.scope));
  }
  if (selector.type === "bookmark-memberships") {
    if (target.scope.type === "feed") return false;
    return selector.bookmarks.some((bookmark) => {
      if (target.scope.type === "tag") {
        return bookmark.tagIds.includes(target.scope.tagId);
      }
      if (target.scope.type !== "view") return false;
      const targetViewId = target.scope.viewId;
      const placedViewIds = new Set(bookmark.viewIds);
      for (const view of memberships.views) {
        if (view.categoryIds.some((tagId) => bookmark.tagIds.includes(tagId))) {
          placedViewIds.add(view.id);
        }
      }
      return targetViewId === UNCATEGORIZED_VIEW_ID
        ? placedViewIds.size === 0
        : placedViewIds.has(targetViewId);
    });
  }

  const feedIds = new Set(selector.feedIds);
  if (target.scope.type === "feed") {
    return feedIds.has(target.scope.feedId);
  }
  if (target.scope.type === "tag") {
    const targetTagId = target.scope.tagId;
    return memberships.feedCategories.some(
      ({ feedId, categoryId }) =>
        categoryId === targetTagId && feedIds.has(feedId),
    );
  }
  return (memberships.viewFeedIds[target.scope.viewId] ?? []).some((feedId) =>
    feedIds.has(feedId),
  );
}

export function expandInvalidationSummary(input: {
  summary: ReconciliationInvalidationSummary;
  retainedScopes: ReconciliationScopeTarget[];
  memberships: ReconciliationInvalidationMemberships;
}) {
  if (input.summary.scopeImpact.type === "unknown") {
    return { scopeImpactUnknown: true, scopes: [] };
  }
  return {
    scopeImpactUnknown: false,
    scopes: input.retainedScopes.filter((target) =>
      input.summary.scopeImpact.type === "known"
        ? input.summary.scopeImpact.selectors.some((selector) =>
            selectorMatchesScope(selector, target, input.memberships),
          )
        : false,
    ),
  };
}

export function contentStatusKeyForEntity(input: {
  isSaved: boolean;
  isRead: boolean;
}): ContentStatusKey {
  return `${input.isSaved ? "saved" : "inbox"}:${input.isRead ? "archived" : "unread"}`;
}

export function buildBookmarkInvalidationSummary(input: {
  before?: BookmarkInvalidationState | null;
  after?: BookmarkInvalidationState | null;
  states?: BookmarkInvalidationState[];
  contentStatusKeys?: ContentStatusKey[];
}): ReconciliationInvalidationSummary {
  const states = [...(input.states ?? []), input.before, input.after].filter(
    (state): state is BookmarkInvalidationState => Boolean(state),
  );
  const contentStatusKeys = unique(
    input.contentStatusKeys ?? states.map(contentStatusKeyForEntity),
  );
  return {
    type: "reconciliation-invalidation",
    domains: ["navigation"],
    scopeImpact: {
      type: "known",
      selectors: [
        {
          type: "bookmark-memberships",
          bookmarks: states,
          contentStatusKeys,
        },
      ],
    },
  };
}

export function organizationInvalidationSummary(
  input: {
    scopes?: ReconciliationInvalidationSummary["scopeImpact"];
  } = {},
): ReconciliationInvalidationSummary {
  return {
    type: "reconciliation-invalidation",
    domains: ["organization", "navigation"],
    scopeImpact: input.scopes ?? {
      type: "known",
      selectors: [
        {
          type: "all-retained",
          contentStatusKeys: [
            "inbox:unread",
            "inbox:archived",
            "saved:unread",
            "saved:archived",
          ],
        },
      ],
    },
  };
}

export function buildFeedInvalidationSummary(input: {
  feedIds: number[];
  contentStatusKeys: ContentStatusKey[];
}): ReconciliationInvalidationSummary {
  return {
    type: "reconciliation-invalidation",
    domains: ["navigation"],
    scopeImpact: {
      type: "known",
      selectors: [
        {
          type: "feed-memberships",
          feedIds: unique(input.feedIds),
          contentStatusKeys: unique(input.contentStatusKeys),
        },
      ],
    },
  };
}

export function contentStatusKeysAroundChange(input: {
  saveStatuses: Array<ContentStatusFilter["saveStatus"]>;
  archiveStatuses: Array<ContentStatusFilter["archiveStatus"]>;
}): ContentStatusKey[] {
  return unique(
    input.saveStatuses.flatMap((saveStatus) =>
      input.archiveStatuses.map<ContentStatusKey>(
        (archiveStatus) => `${saveStatus}:${archiveStatus}`,
      ),
    ),
  );
}
