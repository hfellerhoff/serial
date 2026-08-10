import type { ContentStatusFilter } from "~/lib/content-status";
import type {
  ApplicationFeed,
  ApplicationFeedItem,
  ApplicationView,
  DatabaseContentCategory,
  DatabaseFeedCategory,
  DatabaseViewFeed,
} from "~/server/db/schema";
import type { ApplicationBookmark } from "~/server/mixed-content/projection";
import type { NavigationSnapshot } from "~/server/navigation/snapshot";
import { buildContentStatusKey } from "~/lib/content-status";

export const REQUIRED_RECONCILIATION_DOMAINS = [
  "organization",
  "active-scope",
  "navigation",
] as const;

export type RequiredReconciliationDomain =
  (typeof REQUIRED_RECONCILIATION_DOMAINS)[number];

export const RECONCILIATION_HYDRATION_DOMAINS = [
  ...REQUIRED_RECONCILIATION_DOMAINS,
  "bookmarks",
] as const;

export type ReconciliationHydrationDomain =
  (typeof RECONCILIATION_HYDRATION_DOMAINS)[number];

export type AutomaticRssOwner = "client" | "background-task";

export type ReconciliationScope =
  | { type: "view"; viewId: number }
  | { type: "feed"; feedId: number }
  | { type: "tag"; tagId: number };

export type ReconciliationScopeTarget = {
  type: "scope";
  scope: ReconciliationScope;
  contentStatus: ContentStatusFilter;
};

export type ReconciliationTarget =
  { type: "organization" } | { type: "navigation" } | ReconciliationScopeTarget;

export type OrganizationSnapshot = {
  views: ApplicationView[];
  feeds: ApplicationFeed[];
  tags: DatabaseContentCategory[];
  feedTags: DatabaseFeedCategory[];
  directViewFeeds: DatabaseViewFeed[];
  effectiveViewFeeds: Array<{ viewId: number; feedIds: number[] }>;
};

export type ReconciliationEntityKind = "bookmark" | "feed-item";

export type ReconciliationReference = {
  entityKind: ReconciliationEntityKind;
  entityId: string;
  sectionPlacement: number | null;
  normalizedAt: Date;
};

export type ReconciliationCursor = {
  sectionPlacement: number | null;
  normalizedAt: Date;
  entityKind: ReconciliationEntityKind;
  entityId: string;
} | null;

export type ReconciliationEntityManifestEntry = {
  id: string;
  version: string;
};

export type ReconciliationPageManifest = {
  feedItems: ReconciliationEntityManifestEntry[];
  bookmarks: ReconciliationEntityManifestEntry[];
};

export type ReconciliationScopeInput = {
  target: ReconciliationScopeTarget;
  pageManifest: ReconciliationPageManifest;
  membershipRevision: number;
};

export type TargetedReconciliationInput =
  | { target: { type: "organization" } }
  | { target: { type: "navigation" } }
  | ReconciliationScopeInput;

export type ReconciliationSelectionInput =
  | {
      type: "cold";
      contentStatus: ContentStatusFilter;
      membershipRevision: number;
    }
  | {
      type: "selected";
      scope: ReconciliationScope;
      contentStatus: ContentStatusFilter;
      pageManifest: ReconciliationPageManifest;
      membershipRevision: number;
    };

export type ReconciliationInput =
  | {
      type: "full";
      reconciliationId: string;
      selection: ReconciliationSelectionInput;
    }
  | {
      type: "targeted";
      reconciliationId: string;
      targets: TargetedReconciliationInput[];
    };

export type EntityDiff<TEntity extends { id: string }> =
  | { status: "unchanged"; id: string }
  | { status: "upsert"; entity: TEntity }
  | { status: "delete"; id: string };

export type ActiveFirstPageResult = {
  target: ReconciliationScopeTarget;
  membershipRevision: number;
  orderedRefs: ReconciliationReference[];
  feedItemDiffs: Array<EntityDiff<ApplicationFeedItem>>;
  bookmarkDiffs: Array<EntityDiff<ApplicationBookmark>>;
  cursor: ReconciliationCursor;
  hasMore: boolean;
};

export type ReconciliationDomainFailure = {
  phase:
    | "load-organization"
    | "resolve-selection"
    | "load-active-scope"
    | "load-navigation";
  domain: RequiredReconciliationDomain;
  target?: ReconciliationScopeTarget;
  message: string;
};

export type ReconciliationChunk =
  | {
      type: "organization-snapshot";
      snapshot: OrganizationSnapshot;
    }
  | {
      type: "active-first-page";
      page: ActiveFirstPageResult;
    }
  | {
      type: "navigation-snapshot";
      snapshot: NavigationSnapshot;
    }
  | { type: "automatic-rss-owner"; owner: AutomaticRssOwner }
  | {
      type: "domain-complete";
      domain: RequiredReconciliationDomain;
      target?: ReconciliationScopeTarget;
    }
  | {
      type: "domain-error";
      failure: ReconciliationDomainFailure;
    }
  | {
      type: "epoch-complete";
      requiredDomains: RequiredReconciliationDomain[];
    };

export type ReconciliationStreamEvent = {
  reconciliationId: string;
  chunk: ReconciliationChunk;
};

export type ReconciliationRequestIntent =
  | {
      type: "full";
      selectedScope: ReconciliationScopeTarget;
    }
  | {
      type: "targeted";
      targets: ReconciliationTarget[];
    };

export function getReconciliationScopeKey(target: ReconciliationScopeTarget) {
  const scopeId =
    target.scope.type === "view"
      ? target.scope.viewId
      : target.scope.type === "feed"
        ? target.scope.feedId
        : target.scope.tagId;
  return `${target.scope.type}:${scopeId}:${buildContentStatusKey(target.contentStatus)}`;
}

export function getReconciliationTargetKey(target: ReconciliationTarget) {
  return target.type === "scope"
    ? `scope:${getReconciliationScopeKey(target)}`
    : target.type;
}

export function getRequiredTargetsForFullReconciliation(
  selectedScope: ReconciliationScopeTarget,
): ReconciliationTarget[] {
  return [{ type: "organization" }, selectedScope, { type: "navigation" }];
}

export function getTargetDomain(
  target: ReconciliationTarget,
): RequiredReconciliationDomain {
  return target.type === "scope" ? "active-scope" : target.type;
}
