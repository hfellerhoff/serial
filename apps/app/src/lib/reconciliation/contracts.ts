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
  "bookmarks",
] as const;

export type RequiredReconciliationDomain =
  (typeof REQUIRED_RECONCILIATION_DOMAINS)[number];

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
  | { type: "organization" }
  | { type: "navigation" }
  | { type: "bookmarks" }
  | ReconciliationScopeTarget;

export type OrganizationSnapshot = {
  views: ApplicationView[];
  feeds: ApplicationFeed[];
  tags: DatabaseContentCategory[];
  feedTags: DatabaseFeedCategory[];
  directViewFeeds: DatabaseViewFeed[];
};

export type ReconciliationEntityKind = "bookmark" | "feed-item";

export type ReconciliationReference = {
  entityKind: ReconciliationEntityKind;
  entityId: string;
  sectionPlacement: number | null;
  normalizedAt: Date;
};

export type ReconciliationCursor =
  | {
      type: "feed";
      placement?: number;
      postedAt: Date;
      id: string;
      isWatchedUpdatedAt?: Date | null;
      isWatchLaterUpdatedAt?: Date | null;
    }
  | {
      type: "mixed";
      sectionPlacement: number | null;
      normalizedAt: Date;
      entityKind: ReconciliationEntityKind;
      entityId: string;
    }
  | null;

export type ReconciliationEntityManifestEntry = {
  id: string;
  version: string;
};

export type ReconciliationPageManifest = {
  orderedRefs: ReconciliationReference[];
  feedItems: ReconciliationEntityManifestEntry[];
  bookmarks: ReconciliationEntityManifestEntry[];
  cursor: ReconciliationCursor;
};

export type BookmarkBucketManifestEntry = {
  bucket: number;
  version: string;
};

export type ReconciliationScopeInput = {
  target: ReconciliationScopeTarget;
  pageManifest: ReconciliationPageManifest;
  membershipRevision: number;
};

export type TargetedReconciliationInput =
  | { target: { type: "organization" } }
  | { target: { type: "navigation" } }
  | {
      target: { type: "bookmarks" };
      bookmarkManifest: BookmarkBucketManifestEntry[];
    }
  | ReconciliationScopeInput;

export type ReconciliationInput =
  | {
      type: "full";
      reconciliationId: string;
      selectedScope: ReconciliationScopeInput;
      bookmarkManifest: BookmarkBucketManifestEntry[];
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

export type BookmarkSyncPage = {
  bucket: number;
  version: string;
  pageIndex: number;
  diffs: Array<EntityDiff<ApplicationBookmark>>;
  completesBucket: boolean;
};

export type ReconciliationDomainFailure = {
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
  | {
      type: "bookmark-sync-page";
      page: BookmarkSyncPage;
    }
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

export type ReconciliationResult = {
  reconciliationId: string;
  chunks: ReconciliationChunk[];
  automaticRssOwner?: AutomaticRssOwner;
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
  return [
    { type: "organization" },
    selectedScope,
    { type: "navigation" },
    { type: "bookmarks" },
  ];
}

export function getTargetDomain(
  target: ReconciliationTarget,
): RequiredReconciliationDomain {
  return target.type === "scope" ? "active-scope" : target.type;
}
