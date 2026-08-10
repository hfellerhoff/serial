import { describe, expect, it } from "vitest";
import type { ApplicationFeedItem } from "~/server/db/schema";
import type { ApplicationBookmark } from "~/server/mixed-content/projection";
import type {
  ActiveFirstPageResult,
  OrganizationSnapshot,
  ReconciliationCommand,
  ReconciliationCoordinatorEvent,
  ReconciliationCoordinatorState,
  ReconciliationRequestIntent,
  ReconciliationScopeTarget,
  ReconciliationTarget,
  RequiredReconciliationDomain,
} from "~/lib/reconciliation";
import {
  createReconciliationCoordinatorState,
  createReconciliationDataState,
  getReconciliationTargetKey,
  reduceReconciliationData,
  transitionReconciliation,
} from "~/lib/reconciliation";

const NOW = new Date("2026-08-10T12:00:00.000Z");

const ACTIVE_SCOPE = {
  type: "scope",
  scope: { type: "view", viewId: 7 },
  contentStatus: { saveStatus: "inbox", archiveStatus: "unread" },
} satisfies ReconciliationScopeTarget;

const OTHER_SCOPE = {
  type: "scope",
  scope: { type: "tag", tagId: 8 },
  contentStatus: { saveStatus: "saved", archiveStatus: "archived" },
} satisfies ReconciliationScopeTarget;

const ORGANIZATION = { type: "organization" } as const;
const NAVIGATION = { type: "navigation" } as const;
const BOOKMARKS = { type: "bookmarks" } as const;

function feedItem(
  id: string,
  overrides: Partial<ApplicationFeedItem> = {},
): ApplicationFeedItem {
  return {
    id,
    feedId: 1,
    contentId: id,
    title: id,
    author: "Serial test",
    url: `https://example.com/${id}`,
    thumbnail: "",
    content: id,
    contentSnippet: id,
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
    contentHash: id,
    platform: "website",
    ...overrides,
  };
}

function bookmark(
  id: string,
  overrides: Partial<ApplicationBookmark> = {},
): ApplicationBookmark {
  return {
    id,
    title: id,
    sourceUrl: `https://example.com/${id}`,
    canonicalUrl: `https://example.com/${id}`,
    ...overrides,
  } as ApplicationBookmark;
}

function firstPage(
  membershipRevision: number,
  overrides: Partial<ActiveFirstPageResult> = {},
): ActiveFirstPageResult {
  return {
    target: ACTIVE_SCOPE,
    membershipRevision,
    orderedRefs: [],
    feedItemDiffs: [],
    bookmarkDiffs: [],
    cursor: null,
    hasMore: false,
    ...overrides,
  };
}

function organizationSnapshot(name: string): OrganizationSnapshot {
  return {
    views: [{ id: 1, name }] as OrganizationSnapshot["views"],
    feeds: [],
    tags: [],
    feedTags: [],
    directViewFeeds: [],
  };
}

describe("reconciliation data reducers", () => {
  it("replaces small domains and page membership without inferring entity deletion", () => {
    const originalOrganization = organizationSnapshot("Original");
    const replacementOrganization = organizationSnapshot("Replacement");
    const itemA = feedItem("a");
    const itemB = feedItem("b");
    const itemC = feedItem("c");
    let state = createReconciliationDataState({
      organization: originalOrganization,
      feedItems: { a: itemA, b: itemB },
    });

    ({ state } = reduceReconciliationData(state, {
      type: "apply-organization",
      snapshot: replacementOrganization,
    }));
    expect(state.organization).toBe(replacementOrganization);

    const applied = reduceReconciliationData(state, {
      type: "apply-active-first-page",
      currentMembershipRevision: 4,
      page: firstPage(4, {
        orderedRefs: [
          {
            entityKind: "feed-item",
            entityId: "c",
            sectionPlacement: null,
            normalizedAt: NOW,
          },
        ],
        feedItemDiffs: [
          { status: "unchanged", id: "a" },
          { status: "upsert", entity: itemC },
        ],
      }),
    });

    expect(applied.applied).toBe(true);
    expect(Object.keys(applied.state.feedItems).sort()).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(
      applied.state.scopes["view:7:inbox:unread"]?.orderedRefs.map(
        ({ entityId }) => entityId,
      ),
    ).toEqual(["c"]);

    const deleted = reduceReconciliationData(applied.state, {
      type: "apply-active-first-page",
      currentMembershipRevision: 4,
      page: firstPage(4, {
        feedItemDiffs: [{ status: "delete", id: "b" }],
      }),
    });
    expect(deleted.state.feedItems.b).toBeUndefined();
  });

  it("rejects an active page whose membership revision is stale", () => {
    const state = createReconciliationDataState({
      feedItems: { a: feedItem("a") },
    });
    const result = reduceReconciliationData(state, {
      type: "apply-active-first-page",
      currentMembershipRevision: 2,
      page: firstPage(1, {
        feedItemDiffs: [{ status: "delete", id: "a" }],
      }),
    });
    expect(result).toEqual({ state, applied: false });
  });

  it("applies a bounded Bookmark bucket only after its final page", () => {
    const oldBookmark = bookmark("old");
    const newBookmark = bookmark("new");
    let state = createReconciliationDataState({
      bookmarks: { old: oldBookmark },
    });

    ({ state } = reduceReconciliationData(state, {
      type: "apply-bookmark-sync-page",
      page: {
        bucket: 3,
        version: "next",
        pageIndex: 0,
        diffs: [{ status: "delete", id: "old" }],
        completesBucket: false,
      },
    }));
    expect(state.bookmarks.old).toBe(oldBookmark);

    ({ state } = reduceReconciliationData(state, {
      type: "apply-bookmark-sync-page",
      page: {
        bucket: 3,
        version: "next",
        pageIndex: 1,
        diffs: [{ status: "upsert", entity: newBookmark }],
        completesBucket: true,
      },
    }));
    expect(state.bookmarks).toEqual({ new: newBookmark });
    expect(state.bookmarkBucketVersions[3]).toBe("next");
  });
});

type TestCoordinator = ReconciliationCoordinatorState<string, string>;
type TestEvent = ReconciliationCoordinatorEvent<string, string>;
type TestCommand = ReconciliationCommand<string, string>;

function coordinatorHarness() {
  let state: TestCoordinator = createReconciliationCoordinatorState<
    string,
    string
  >("test-session");
  return {
    get state() {
      return state;
    },
    send(event: TestEvent) {
      const transition = transitionReconciliation(state, event);
      state = transition.state;
      return transition.commands;
    },
  };
}

function hydrateAll(send: (event: TestEvent) => TestCommand[]) {
  for (const domain of [
    "organization",
    "active-scope",
    "navigation",
    "bookmarks",
  ] satisfies RequiredReconciliationDomain[]) {
    send({ type: "hydration-complete", domain });
  }
}

function startedRequest(commands: TestCommand[]) {
  const command = commands.find(
    (candidate) => candidate.type === "start-reconciliation",
  );
  if (!command || command.type !== "start-reconciliation") {
    throw new Error("Expected reconciliation request");
  }
  return command.request;
}

function requiredTargets(): ReconciliationTarget[] {
  return [ORGANIZATION, ACTIVE_SCOPE, NAVIGATION, BOOKMARKS];
}

function hydrationFor(target: ReconciliationTarget) {
  return [
    target.type === "scope" ? "active-scope" : target.type,
  ] as RequiredReconciliationDomain[];
}

describe("reconciliation coordinator", () => {
  it("establishes trust only after a complete finite epoch and SSE connection", () => {
    const harness = coordinatorHarness();
    hydrateAll(harness.send);
    harness.send({ type: "cache-usable", at: 1 });
    const request = startedRequest(
      harness.send({
        type: "request-reconciliation",
        intent: { type: "full", selectedScope: ACTIVE_SCOPE },
      }),
    );

    for (const [index, target] of requiredTargets().entries()) {
      const commands = harness.send({
        type: "authoritative-received",
        reconciliationId: request.reconciliationId,
        target,
        requiresHydration: hydrationFor(target),
        payload: `domain-${index}`,
      });
      expect(commands).toHaveLength(1);
      harness.send({
        type: "authoritative-applied",
        reconciliationId: request.reconciliationId,
        target,
        at: index + 2,
      });
    }

    expect(harness.state.serverParityAppliedAt).toBeNull();
    harness.send({
      type: "request-settled",
      reconciliationId: request.reconciliationId,
      at: 6,
    });
    expect(harness.state.serverParityAppliedAt).toBe(6);
    expect(harness.state.trustedUpToDate).toBe(false);
    harness.send({ type: "sse-connection-changed", connected: true });
    expect(harness.state.trustedUpToDate).toBe(true);
    expect(harness.state.domains.organization.appliedAt).toBe(2);
    expect(harness.state.domains["active-scope"].appliedAt).toBe(3);
    expect(harness.state.domains.navigation.appliedAt).toBe(4);
    expect(harness.state.domains.bookmarks.appliedAt).toBe(5);
  });

  it("preserves applied domains and withholds parity after partial failure", () => {
    const harness = coordinatorHarness();
    hydrateAll(harness.send);
    harness.send({ type: "cache-usable", at: 1 });
    harness.send({ type: "sse-connection-changed", connected: true });
    const request = startedRequest(
      harness.send({
        type: "request-reconciliation",
        intent: { type: "full", selectedScope: ACTIVE_SCOPE },
      }),
    );

    for (const target of [ORGANIZATION, ACTIVE_SCOPE, BOOKMARKS]) {
      harness.send({
        type: "authoritative-received",
        reconciliationId: request.reconciliationId,
        target,
        requiresHydration: hydrationFor(target),
        payload: getReconciliationTargetKey(target),
      });
      harness.send({
        type: "authoritative-applied",
        reconciliationId: request.reconciliationId,
        target,
        at: 2,
      });
    }
    const commands = harness.send({
      type: "request-settled",
      reconciliationId: request.reconciliationId,
      at: 3,
      failedTargets: [NAVIGATION],
    });

    expect(commands).toEqual([]);
    expect(harness.state.cacheUsableAt).toBe(1);
    expect(harness.state.domains.organization.status).toBe("verified");
    expect(harness.state.domains.navigation.status).toBe("dirty");
    expect(harness.state.serverParityAppliedAt).toBeNull();
    expect(harness.state.trustedUpToDate).toBe(false);
  });

  it("rejects a stale target atomically and schedules one trailing full repair", () => {
    const harness = coordinatorHarness();
    hydrateAll(harness.send);
    const request = startedRequest(
      harness.send({
        type: "request-reconciliation",
        intent: { type: "full", selectedScope: ACTIVE_SCOPE },
      }),
    );

    expect(
      harness.send({
        type: "live-event-received",
        eventId: "mutation",
        targets: [ACTIVE_SCOPE],
        requiresHydration: ["active-scope"],
        invalidates: [ACTIVE_SCOPE],
      }),
    ).toEqual([]);

    expect(
      harness.send({
        type: "authoritative-received",
        reconciliationId: request.reconciliationId,
        target: ACTIVE_SCOPE,
        requiresHydration: ["active-scope"],
        payload: "stale-page-and-diffs",
      }),
    ).toEqual([]);
    expect(
      harness.state.dirtyTargets[getReconciliationTargetKey(ACTIVE_SCOPE)],
    ).toBeDefined();
    expect(harness.state.trailingIntent?.type).toBe("full");

    const trailing = harness.send({
      type: "request-settled",
      reconciliationId: request.reconciliationId,
      at: 2,
    });
    expect(startedRequest(trailing).intent).toEqual({
      type: "full",
      selectedScope: ACTIVE_SCOPE,
    });
  });

  it("unions targeted work and lets one full intent subsume the trailing queue", () => {
    const harness = coordinatorHarness();
    const first = startedRequest(
      harness.send({
        type: "request-reconciliation",
        intent: { type: "targeted", targets: [ACTIVE_SCOPE] },
      }),
    );
    for (const intent of [
      { type: "targeted", targets: [OTHER_SCOPE] },
      { type: "targeted", targets: [NAVIGATION] },
      { type: "full", selectedScope: ACTIVE_SCOPE },
      { type: "targeted", targets: [BOOKMARKS] },
    ] satisfies ReconciliationRequestIntent[]) {
      expect(harness.send({ type: "request-reconciliation", intent })).toEqual(
        [],
      );
    }

    expect(harness.state.trailingIntent).toEqual({
      type: "full",
      selectedScope: ACTIVE_SCOPE,
    });
    const trailing = harness.send({
      type: "request-settled",
      reconciliationId: first.reconciliationId,
      at: 1,
    });
    expect(trailing).toHaveLength(1);
    expect(startedRequest(trailing).intent.type).toBe("full");
    expect(harness.state.trailingIntent).toBeNull();
  });

  it("does not flush a buffered result after a newer request supersedes it", () => {
    const harness = coordinatorHarness();
    const first = startedRequest(
      harness.send({
        type: "request-reconciliation",
        intent: { type: "targeted", targets: [ACTIVE_SCOPE] },
      }),
    );
    harness.send({
      type: "authoritative-received",
      reconciliationId: first.reconciliationId,
      target: ACTIVE_SCOPE,
      requiresHydration: ["active-scope"],
      payload: "buffered-old-result",
    });
    harness.send({
      type: "request-settled",
      reconciliationId: first.reconciliationId,
      at: 1,
    });
    startedRequest(
      harness.send({
        type: "request-reconciliation",
        intent: { type: "targeted", targets: [ACTIVE_SCOPE] },
      }),
    );

    expect(
      harness.send({ type: "hydration-complete", domain: "active-scope" }),
    ).toEqual([]);
    expect(harness.state.bufferedApplications).toEqual([]);
    expect(harness.state.trailingIntent).toEqual({
      type: "targeted",
      targets: [ACTIVE_SCOPE],
    });
  });

  it("buffers per target without letting one unhydrated domain block another", () => {
    const harness = coordinatorHarness();
    harness.send({
      type: "live-event-received",
      eventId: "scope-first",
      targets: [ACTIVE_SCOPE],
      requiresHydration: ["bookmarks"],
      payload: "scope-first",
    });
    harness.send({
      type: "live-event-received",
      eventId: "scope-second",
      targets: [ACTIVE_SCOPE],
      requiresHydration: ["organization"],
      payload: "scope-second",
    });
    harness.send({
      type: "live-event-received",
      eventId: "organization-independent",
      targets: [ORGANIZATION],
      requiresHydration: ["organization"],
      payload: "organization-independent",
    });

    expect(
      harness.send({ type: "hydration-complete", domain: "organization" }),
    ).toEqual([
      {
        type: "apply-live-event",
        eventId: "organization-independent",
        payload: "organization-independent",
      },
    ]);
    expect(
      harness.send({ type: "hydration-complete", domain: "bookmarks" }),
    ).toEqual([
      {
        type: "apply-live-event",
        eventId: "scope-first",
        payload: "scope-first",
      },
      {
        type: "apply-live-event",
        eventId: "scope-second",
        payload: "scope-second",
      },
    ]);
  });
});
