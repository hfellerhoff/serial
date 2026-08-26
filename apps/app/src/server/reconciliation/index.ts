import { loadOrganizationSnapshot } from "./organization";
import type {
  ActiveFirstPageResult,
  EntityDiff,
  OrganizationSnapshot,
  ReconciliationChunk,
  ReconciliationDomainFailure,
  ReconciliationEntityManifestEntry,
  ReconciliationInput,
  ReconciliationPageManifest,
  ReconciliationScope,
  ReconciliationScopeInput,
  ReconciliationScopeTarget,
  ReconciliationStreamEvent,
  RequiredReconciliationDomain,
} from "~/lib/reconciliation";
import type { db as defaultDatabase } from "~/server/db";
import type { ApplicationFeedItem } from "~/server/db/schema";
import type { ScopeData } from "~/server/mixed-content/projection/scope";
import type {
  ApplicationBookmark,
  MixedContentPage,
} from "~/server/mixed-content/projection";
import {
  buildContentStatusKey,
  CONTENT_STATUS_FILTERS,
} from "~/lib/content-status";
import {
  getBookmarkReconciliationVersion,
  getFeedItemReconciliationVersion,
  REQUIRED_RECONCILIATION_DOMAINS,
} from "~/lib/reconciliation";
import {
  queryMixedContentPage,
  queryResolvedMixedContentPage,
} from "~/server/mixed-content/projection";
import { queryNavigationSnapshot } from "~/server/navigation/snapshot";
import { resolveAutomaticRssOwner } from "~/server/rss/automaticOwnership";
import { ITEMS_PER_PAGE } from "~/server/api/constants";
import { UNCATEGORIZED_VIEW_ID } from "~/lib/data/views/constants";

type ReconciliationDatabase = typeof defaultDatabase;
const VIEW_PAGE_BUILD_CONCURRENCY = 4;

type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown };

function outcome<T>(promise: Promise<T>): Promise<Outcome<T>> {
  return promise.then(
    (value) => ({ ok: true, value }),
    (error: unknown) => ({ ok: false, error }),
  );
}

function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unknown reconciliation error";
}

function event(
  reconciliationId: string,
  chunk: ReconciliationChunk,
): ReconciliationStreamEvent {
  return { reconciliationId, chunk };
}

function failure(input: ReconciliationDomainFailure): ReconciliationChunk {
  return { type: "domain-error", failure: input };
}

function scopeDataFromOrganization(
  organization: OrganizationSnapshot,
  scope: ReconciliationScope,
): ScopeData {
  if (scope.type === "feed") {
    return {
      valid: organization.feeds.some(({ id }) => id === scope.feedId),
      targetView: null,
      categoryIds: [],
      directFeedIds: [],
      sections: [],
    };
  }
  if (scope.type === "tag") {
    return {
      valid: organization.tags.some(({ id }) => id === scope.tagId),
      targetView: null,
      categoryIds: [],
      directFeedIds: [],
      sections: [],
    };
  }
  if (scope.viewId === UNCATEGORIZED_VIEW_ID) {
    return {
      valid: true,
      targetView: null,
      categoryIds: [],
      directFeedIds: [],
      sections: [],
    };
  }
  const view = organization.views.find(({ id }) => id === scope.viewId);
  return {
    valid: view !== undefined,
    targetView: view ?? null,
    categoryIds: view?.categoryIds ?? [],
    directFeedIds: view?.feedIds ?? [],
    sections: view?.viewSections ?? [],
  };
}

function entityDiffs<TEntity extends { id: string }>(input: {
  entities: TEntity[];
  manifest: ReconciliationEntityManifestEntry[];
  streamedVersions: Map<string, string>;
  version: (entity: TEntity) => string;
}): Array<EntityDiff<TEntity>> {
  const clientVersions = new Map([
    ...input.manifest.map(({ id, version }) => [id, version] as const),
    ...input.streamedVersions,
  ]);
  return input.entities.map((entity) => {
    const version = input.version(entity);
    input.streamedVersions.set(entity.id, version);
    return clientVersions.get(entity.id) === version
      ? { status: "unchanged", id: entity.id }
      : { status: "upsert", entity };
  });
}

type StreamedEntityVersions = {
  feedItems: Map<string, string>;
  bookmarks: Map<string, string>;
};

function emptyStreamedEntityVersions(): StreamedEntityVersions {
  return { feedItems: new Map(), bookmarks: new Map() };
}

function activeFirstPage(input: {
  scopeInput: ReconciliationScopeInput;
  page: MixedContentPage;
  streamedVersions: StreamedEntityVersions;
}): ActiveFirstPageResult {
  return {
    target: input.scopeInput.target,
    membershipRevision: input.scopeInput.membershipRevision,
    orderedRefs: input.page.references,
    feedItemDiffs: entityDiffs<ApplicationFeedItem>({
      entities: input.page.feedItems,
      manifest: input.scopeInput.pageManifest.feedItems,
      streamedVersions: input.streamedVersions.feedItems,
      version: getFeedItemReconciliationVersion,
    }),
    bookmarkDiffs: entityDiffs<ApplicationBookmark>({
      entities: input.page.bookmarks,
      manifest: input.scopeInput.pageManifest.bookmarks,
      streamedVersions: input.streamedVersions.bookmarks,
      version: getBookmarkReconciliationVersion,
    }),
    cursor: input.page.cursor,
    hasMore: input.page.hasMore,
  };
}

function viewPageTargets(
  organization: OrganizationSnapshot,
  activeTarget: ReconciliationScopeTarget,
) {
  const targets = organization.views.flatMap((view) =>
    CONTENT_STATUS_FILTERS.map(
      (contentStatus) =>
        ({
          type: "scope",
          scope: { type: "view", viewId: view.id },
          contentStatus,
        }) satisfies ReconciliationScopeTarget,
    ),
  );
  if (activeTarget.scope.type !== "view") return targets;
  const activeKey = `${activeTarget.scope.viewId}:${buildContentStatusKey(
    activeTarget.contentStatus,
  )}`;
  return targets.filter(
    (target) =>
      `${target.scope.viewId}:${buildContentStatusKey(target.contentStatus)}` !==
      activeKey,
  );
}

function viewPageInput(
  target: ReconciliationScopeTarget,
  membershipRevision: number,
): ReconciliationScopeInput {
  return {
    target,
    pageManifest: emptyPageManifest(),
    membershipRevision,
  };
}

function emptyPageManifest(): ReconciliationPageManifest {
  return {
    feedItems: [],
    bookmarks: [],
  };
}

function resolveFullScope(
  request: Extract<ReconciliationInput, { type: "full" }>,
  organization: OrganizationSnapshot,
): ReconciliationScopeInput | null {
  if (request.selection.type === "selected") {
    const target: ReconciliationScopeTarget = {
      type: "scope",
      scope: request.selection.scope,
      contentStatus: request.selection.contentStatus,
    };
    return scopeDataFromOrganization(organization, target.scope).valid
      ? {
          target,
          pageManifest: request.selection.pageManifest,
          membershipRevision: request.selection.membershipRevision,
        }
      : null;
  }
  const view = organization.views[0];
  if (!view) return null;
  return {
    target: {
      type: "scope",
      scope: { type: "view", viewId: view.id },
      contentStatus: request.selection.contentStatus,
    },
    pageManifest: emptyPageManifest(),
    membershipRevision: request.selection.membershipRevision,
  };
}

async function* reconcileFull(input: {
  database: ReconciliationDatabase;
  userId: string;
  request: Extract<ReconciliationInput, { type: "full" }>;
}): AsyncGenerator<ReconciliationStreamEvent> {
  const { database, userId, request } = input;
  const organizationPromise = outcome(
    loadOrganizationSnapshot({ database, userId }),
  );
  const navigationPromise = outcome(
    queryNavigationSnapshot({ database, userId }),
  );
  const ownerPromise = outcome(resolveAutomaticRssOwner({ database, userId }));

  // Navigation stays concurrent with the View matrix and is yielded at the
  // earliest stream boundary where it has resolved (after the active scope,
  // or ahead of a completed wave's pages), so the sidebar can paint without
  // lengthening the first response. A navigation failure is deferred until
  // after the matrix and owner chunks so the rest of the epoch still
  // streams, matching the pre-reorder failure semantics.
  let navigationOutcome: Awaited<typeof navigationPromise> | null = null;
  void navigationPromise.then((result) => {
    navigationOutcome = result;
  });
  let navigationYielded = false;
  const settledNavigationChunks = (): ReconciliationChunk[] => {
    const settled = navigationOutcome;
    if (navigationYielded || !settled?.ok) return [];
    navigationYielded = true;
    return [
      { type: "navigation-snapshot", snapshot: settled.value },
      { type: "domain-complete", domain: "navigation" },
    ];
  };

  const organization = await organizationPromise;
  if (!organization.ok) {
    yield event(
      request.reconciliationId,
      failure({
        phase: "load-organization",
        domain: "organization",
        message: message(organization.error),
      }),
    );
    return;
  }
  yield event(request.reconciliationId, {
    type: "organization-snapshot",
    snapshot: organization.value,
  });
  yield event(request.reconciliationId, {
    type: "domain-complete",
    domain: "organization",
  });

  const scopeInput = resolveFullScope(request, organization.value);
  if (!scopeInput) {
    const selectedTarget =
      request.selection.type === "selected"
        ? {
            type: "scope" as const,
            scope: request.selection.scope,
            contentStatus: request.selection.contentStatus,
          }
        : undefined;
    yield event(
      request.reconciliationId,
      failure({
        phase: "resolve-selection",
        domain: "active-scope",
        target: selectedTarget,
        message: "The selected reconciliation scope is unavailable",
      }),
    );
    return;
  }

  const streamedVersions = emptyStreamedEntityVersions();
  const page = await outcome(
    queryResolvedMixedContentPage({
      database,
      userId,
      scope: scopeInput.target.scope,
      scopeData: scopeDataFromOrganization(
        organization.value,
        scopeInput.target.scope,
      ),
      contentStatus: scopeInput.target.contentStatus,
      limit: ITEMS_PER_PAGE,
    }),
  );
  if (!page.ok) {
    yield event(
      request.reconciliationId,
      failure({
        phase: "load-active-scope",
        domain: "active-scope",
        target: scopeInput.target,
        message: message(page.error),
      }),
    );
    return;
  }
  yield event(request.reconciliationId, {
    type: "active-first-page",
    page: activeFirstPage({
      scopeInput,
      page: page.value,
      streamedVersions,
    }),
  });
  yield event(request.reconciliationId, {
    type: "domain-complete",
    domain: "active-scope",
    target: scopeInput.target,
  });

  for (const chunk of settledNavigationChunks()) {
    yield event(request.reconciliationId, chunk);
  }

  const matrixTargets = viewPageTargets(organization.value, scopeInput.target);
  for (
    let start = 0;
    start < matrixTargets.length;
    start += VIEW_PAGE_BUILD_CONCURRENCY
  ) {
    const batch = matrixTargets.slice(
      start,
      start + VIEW_PAGE_BUILD_CONCURRENCY,
    );
    const pages = await Promise.all(
      batch.map(async (target) => ({
        target,
        result: await outcome(
          queryResolvedMixedContentPage({
            database,
            userId,
            scope: target.scope,
            scopeData: scopeDataFromOrganization(
              organization.value,
              target.scope,
            ),
            contentStatus: target.contentStatus,
            limit: ITEMS_PER_PAGE,
          }),
        ),
      })),
    );
    for (const chunk of settledNavigationChunks()) {
      yield event(request.reconciliationId, chunk);
    }
    for (const { target, result } of pages) {
      if (!result.ok) {
        yield event(
          request.reconciliationId,
          failure({
            phase: "load-view-page",
            domain: "active-scope",
            target,
            message: message(result.error),
          }),
        );
        continue;
      }
      yield event(request.reconciliationId, {
        type: "active-first-page",
        page: activeFirstPage({
          scopeInput: viewPageInput(
            target,
            request.selection.membershipRevision,
          ),
          page: result.value,
          streamedVersions,
        }),
      });
      yield event(request.reconciliationId, {
        type: "domain-complete",
        domain: "active-scope",
        target,
      });
    }
  }

  const owner = await ownerPromise;
  yield event(request.reconciliationId, {
    type: "automatic-rss-owner",
    owner: owner.ok ? owner.value : "client",
  });

  const navigation = await navigationPromise;
  if (!navigation.ok) {
    yield event(
      request.reconciliationId,
      failure({
        phase: "load-navigation",
        domain: "navigation",
        message: message(navigation.error),
      }),
    );
    return;
  }
  if (!navigationYielded) {
    navigationYielded = true;
    yield event(request.reconciliationId, {
      type: "navigation-snapshot",
      snapshot: navigation.value,
    });
    yield event(request.reconciliationId, {
      type: "domain-complete",
      domain: "navigation",
    });
  }

  yield event(request.reconciliationId, {
    type: "epoch-complete",
    requiredDomains: [...REQUIRED_RECONCILIATION_DOMAINS],
  });
}

async function* reconcileTargeted(input: {
  database: ReconciliationDatabase;
  userId: string;
  request: Extract<ReconciliationInput, { type: "targeted" }>;
}): AsyncGenerator<ReconciliationStreamEvent> {
  const { database, userId, request } = input;
  const navigationRequested = request.targets.some(
    ({ target }) => target.type === "navigation",
  );
  const completedDomains = new Set<RequiredReconciliationDomain>();
  const streamedVersions = emptyStreamedEntityVersions();

  for (const target of request.targets) {
    if (target.target.type === "navigation") continue;
    if (target.target.type === "organization") {
      const organization = await outcome(
        loadOrganizationSnapshot({ database, userId }),
      );
      if (!organization.ok) {
        yield event(
          request.reconciliationId,
          failure({
            phase: "load-organization",
            domain: "organization",
            message: message(organization.error),
          }),
        );
        return;
      }
      yield event(request.reconciliationId, {
        type: "organization-snapshot",
        snapshot: organization.value,
      });
      yield event(request.reconciliationId, {
        type: "domain-complete",
        domain: "organization",
      });
      completedDomains.add("organization");
      continue;
    }
    if (!("pageManifest" in target)) continue;

    const page = await outcome(
      queryMixedContentPage({
        database,
        userId,
        scope: target.target.scope,
        contentStatus: target.target.contentStatus,
        limit: ITEMS_PER_PAGE,
      }),
    );
    if (!page.ok) {
      const isViewCell = target.target.scope.type === "view";
      yield event(
        request.reconciliationId,
        failure({
          phase: isViewCell ? "load-view-page" : "load-active-scope",
          domain: "active-scope",
          target: target.target,
          message: message(page.error),
        }),
      );
      if (isViewCell) continue;
      return;
    }
    yield event(request.reconciliationId, {
      type: "active-first-page",
      page: activeFirstPage({
        scopeInput: target,
        page: page.value,
        streamedVersions,
      }),
    });
    yield event(request.reconciliationId, {
      type: "domain-complete",
      domain: "active-scope",
      target: target.target,
    });
    completedDomains.add("active-scope");
  }

  if (navigationRequested) {
    const navigation = await outcome(
      queryNavigationSnapshot({ database, userId }),
    );
    if (!navigation.ok) {
      yield event(
        request.reconciliationId,
        failure({
          phase: "load-navigation",
          domain: "navigation",
          message: message(navigation.error),
        }),
      );
      return;
    }
    yield event(request.reconciliationId, {
      type: "navigation-snapshot",
      snapshot: navigation.value,
    });
    yield event(request.reconciliationId, {
      type: "domain-complete",
      domain: "navigation",
    });
    completedDomains.add("navigation");
  }
  yield event(request.reconciliationId, {
    type: "epoch-complete",
    requiredDomains: [...completedDomains],
  });
}

export function reconcileApplicationState(input: {
  database: ReconciliationDatabase;
  userId: string;
  request: ReconciliationInput;
}): AsyncGenerator<ReconciliationStreamEvent> {
  return input.request.type === "full"
    ? reconcileFull({ ...input, request: input.request })
    : reconcileTargeted({ ...input, request: input.request });
}
