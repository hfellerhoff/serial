import { describe, expect, it, vi } from "vitest";
import type {
  ActiveFirstPageResult,
  OrganizationSnapshot,
  ReconciliationInput,
  ReconciliationRequestDescriptor,
  ReconciliationScopeTarget,
  ReconciliationStreamEvent,
  ReconciliationTarget,
} from "~/lib/reconciliation";
import type { NavigationSnapshot } from "~/server/navigation/snapshot";
import {
  createReconciliationRuntime,
  getReconciliationTargetKey,
} from "~/lib/reconciliation";
import { reconciliationInputSchema } from "~/server/reconciliation/input";

const ACTIVE_SCOPE: ReconciliationScopeTarget = {
  type: "scope",
  scope: { type: "view", viewId: 7 },
  contentStatus: { saveStatus: "inbox", archiveStatus: "unread" },
};

const INACTIVE_VIEW_SCOPE: ReconciliationScopeTarget = {
  type: "scope",
  scope: { type: "view", viewId: 8 },
  contentStatus: { saveStatus: "saved", archiveStatus: "archived" },
};

const ORGANIZATION: OrganizationSnapshot = {
  views: [],
  feeds: [],
  tags: [],
  feedTags: [],
  directViewFeeds: [],
  effectiveViewFeeds: [],
};

const PAGE: ActiveFirstPageResult = {
  target: ACTIVE_SCOPE,
  membershipRevision: 0,
  orderedRefs: [],
  feedItemDiffs: [],
  bookmarkDiffs: [],
  cursor: null,
  hasMore: false,
};

const NAVIGATION: NavigationSnapshot = {
  feeds: {},
  tags: {},
  viewFeeds: {},
};

function completeEpoch(
  reconciliationId: string,
  target: ReconciliationScopeTarget = ACTIVE_SCOPE,
): ReconciliationStreamEvent[] {
  return [
    {
      reconciliationId,
      chunk: { type: "organization-snapshot", snapshot: ORGANIZATION },
    },
    {
      reconciliationId,
      chunk: { type: "domain-complete", domain: "organization" },
    },
    {
      reconciliationId,
      chunk: { type: "active-first-page", page: { ...PAGE, target } },
    },
    {
      reconciliationId,
      chunk: {
        type: "domain-complete",
        domain: "active-scope",
        target,
      },
    },
    {
      reconciliationId,
      chunk: { type: "navigation-snapshot", snapshot: NAVIGATION },
    },
    {
      reconciliationId,
      chunk: { type: "domain-complete", domain: "navigation" },
    },
    {
      reconciliationId,
      chunk: {
        type: "epoch-complete",
        requiredDomains: ["organization", "active-scope", "navigation"],
      },
    },
  ];
}

function completeTargetedScope(
  reconciliationId: string,
  target: ReconciliationScopeTarget = ACTIVE_SCOPE,
): ReconciliationStreamEvent[] {
  return [
    {
      reconciliationId,
      chunk: {
        type: "active-first-page",
        page: { ...PAGE, target },
      },
    },
    {
      reconciliationId,
      chunk: {
        type: "domain-complete",
        domain: "active-scope",
        target,
      },
    },
    {
      reconciliationId,
      chunk: {
        type: "epoch-complete",
        requiredDomains: ["active-scope"],
      },
    },
  ];
}

function completeTargetedOrganization(
  reconciliationId: string,
): ReconciliationStreamEvent[] {
  return [
    {
      reconciliationId,
      chunk: { type: "organization-snapshot", snapshot: ORGANIZATION },
    },
    {
      reconciliationId,
      chunk: { type: "domain-complete", domain: "organization" },
    },
    {
      reconciliationId,
      chunk: {
        type: "epoch-complete",
        requiredDomains: ["organization"],
      },
    },
  ];
}

function completeTargetedScopeAndNavigation(
  reconciliationId: string,
): ReconciliationStreamEvent[] {
  return [
    {
      reconciliationId,
      chunk: { type: "active-first-page", page: PAGE },
    },
    {
      reconciliationId,
      chunk: {
        type: "domain-complete",
        domain: "active-scope",
        target: ACTIVE_SCOPE,
      },
    },
    {
      reconciliationId,
      chunk: { type: "navigation-snapshot", snapshot: NAVIGATION },
    },
    {
      reconciliationId,
      chunk: { type: "domain-complete", domain: "navigation" },
    },
    {
      reconciliationId,
      chunk: {
        type: "epoch-complete",
        requiredDomains: ["active-scope", "navigation"],
      },
    },
  ];
}

function harness(
  events: (
    request: ReconciliationRequestDescriptor,
  ) =>
    | Iterable<ReconciliationStreamEvent>
    | AsyncIterable<ReconciliationStreamEvent>,
  applyLiveEvent?: (payload: string[]) =>
    | ReconciliationTarget[]
    | {
        repairTargets?: ReconciliationTarget[];
        dirtyTargets?: ReconciliationTarget[];
        repairIntent?: ReconciliationRequestDescriptor["intent"];
      }
    | void,
  options: {
    isVisible?: () => boolean;
    isOnline?: () => boolean;
    liveEventTargets?: (payload: string[]) => {
      targets: ReconciliationTarget[];
      affectsAllScopes?: boolean;
    };
  } = {},
) {
  const requests: ReconciliationRequestDescriptor[] = [];
  const applications: string[] = [];
  const authoritativeApplications: Array<{
    reconciliationId: string;
    type: string;
  }> = [];
  const liveApplications: string[][] = [];
  let currentSelection: ReconciliationScopeTarget | null = null;
  let now = 0;
  const runtime = createReconciliationRuntime<string[]>({
    sessionId: () => "runtime-session",
    now: () => ++now,
    buildInput: (request) => {
      requests.push(request);
      return {
        type: "full",
        reconciliationId: request.reconciliationId,
        selection: {
          type: "cold",
          contentStatus: { saveStatus: "inbox", archiveStatus: "unread" },
          membershipRevision: 0,
        },
      } satisfies ReconciliationInput;
    },
    openStream: async (_input, signal) => ({
      async *[Symbol.asyncIterator]() {
        const request = requests.at(-1);
        if (!request) throw new Error("Expected a request");
        for await (const event of events(request)) {
          if (signal.aborted) return;
          yield event;
        }
      },
    }),
    applyAuthoritative: (payload, context) => {
      applications.push(payload.type);
      authoritativeApplications.push({
        reconciliationId: context.reconciliationId,
        type: payload.type,
      });
      return true;
    },
    applyLiveEvent: (payload) => {
      liveApplications.push(payload);
      return applyLiveEvent?.(payload);
    },
    getLiveEventTargets: (payload) =>
      options.liveEventTargets?.(payload) ?? {
        targets: currentSelection ? [currentSelection] : [],
      },
    getCurrentSelection: () => currentSelection,
    isVisible: options.isVisible,
    isOnline: options.isOnline,
  });
  return {
    runtime,
    requests,
    applications,
    authoritativeApplications,
    liveApplications,
    setSelection(selection: ReconciliationScopeTarget | null) {
      currentSelection = selection;
    },
  };
}

function hydrate(runtime: ReturnType<typeof harness>["runtime"]) {
  for (const domain of [
    "organization",
    "active-scope",
    "bookmarks",
    "navigation",
  ] as const) {
    runtime.hydrationComplete(domain);
  }
}

describe("client reconciliation runtime", () => {
  it("generates reconciliation IDs accepted by the RPC transport", () => {
    const test = harness(() => []);
    test.runtime.start();
    const request = test.runtime.getState().inFlight;
    expect(request).not.toBeNull();
    expect(
      reconciliationInputSchema.safeParse({
        type: "full",
        reconciliationId: request?.reconciliationId,
        selection: {
          type: "cold",
          contentStatus: { saveStatus: "inbox", archiveStatus: "unread" },
          membershipRevision: 0,
        },
      }).success,
    ).toBe(true);
  });

  it("starts cold, buffers complete domains through hydration, and establishes parity", async () => {
    const test = harness((request) => completeEpoch(request.reconciliationId));
    test.runtime.start();

    await vi.waitFor(() => expect(test.requests).toHaveLength(1));
    expect(test.requests[0]?.intent).toEqual({
      type: "full",
      coldContentStatus: { saveStatus: "inbox", archiveStatus: "unread" },
    });
    expect(test.applications).toEqual([]);

    test.runtime.cacheUsable();
    test.runtime.sseConnectionChanged(true);
    hydrate(test.runtime);

    await vi.waitFor(() =>
      expect(test.applications).toEqual([
        "organization",
        "active-scope",
        "navigation",
      ]),
    );
    expect(test.runtime.getState().trustedUpToDate).toBe(true);
    expect(
      test.runtime.getState().targets[getReconciliationTargetKey(ACTIVE_SCOPE)]
        ?.status,
    ).toBe("verified");
  });

  it("lets the in-flight full stream satisfy startup View activation", async () => {
    let releaseStream!: () => void;
    const streamReleased = new Promise<void>((resolve) => {
      releaseStream = resolve;
    });
    const test = harness(async function* (request) {
      if (request.intent.type === "targeted") {
        yield* completeTargetedScope(request.reconciliationId);
        return;
      }
      await streamReleased;
      yield* completeEpoch(request.reconciliationId);
    });
    hydrate(test.runtime);
    test.runtime.cacheUsable();
    test.runtime.sseConnectionChanged(true);
    test.runtime.start();
    await vi.waitFor(() => expect(test.requests).toHaveLength(1));

    test.setSelection(ACTIVE_SCOPE);
    test.runtime.activateScope(ACTIVE_SCOPE);
    releaseStream();

    await vi.waitFor(() =>
      expect(test.runtime.getState().trustedUpToDate).toBe(true),
    );
    expect(test.requests).toHaveLength(1);
  });

  it.each([
    ["View", { type: "view", viewId: 7 }],
    ["Tag", { type: "tag", tagId: 11 }],
    ["Feed", { type: "feed", feedId: 13 }],
  ] as const)(
    "applies a Bookmark-free %s page before Bookmark hydration",
    async (_name, scope) => {
      const target: ReconciliationScopeTarget = {
        type: "scope",
        scope,
        contentStatus: { saveStatus: "inbox", archiveStatus: "unread" },
      };
      const test = harness((request) =>
        completeEpoch(request.reconciliationId, target),
      );
      test.runtime.cacheUsable();
      test.runtime.sseConnectionChanged(true);
      test.runtime.start();

      test.runtime.hydrationComplete("organization");
      test.runtime.hydrationComplete("active-scope");
      test.runtime.hydrationComplete("navigation");

      await vi.waitFor(() =>
        expect(test.applications).toEqual([
          "organization",
          "active-scope",
          "navigation",
        ]),
      );
      expect(test.runtime.getState().hydratedDomains.bookmarks).toBe(false);
    },
  );

  it("stages a Bookmark page atomically until Bookmark hydration", async () => {
    const bookmarkPage: ActiveFirstPageResult = {
      ...PAGE,
      orderedRefs: [
        {
          entityKind: "bookmark",
          entityId: "bookmark-one",
          sectionPlacement: null,
          normalizedAt: new Date("2026-08-18T00:00:00.000Z"),
        },
      ],
    };
    const test = harness((request) =>
      completeEpoch(request.reconciliationId).map((event) =>
        event.chunk.type === "active-first-page"
          ? {
              ...event,
              chunk: { type: "active-first-page", page: bookmarkPage },
            }
          : event,
      ),
    );
    test.runtime.cacheUsable();
    test.runtime.sseConnectionChanged(true);
    test.runtime.start();

    test.runtime.hydrationComplete("organization");
    test.runtime.hydrationComplete("active-scope");
    test.runtime.hydrationComplete("navigation");
    await vi.waitFor(() =>
      expect(test.applications).toEqual(["organization", "navigation"]),
    );

    test.runtime.hydrationComplete("bookmarks");
    await vi.waitFor(() =>
      expect(test.applications).toEqual([
        "organization",
        "navigation",
        "active-scope",
      ]),
    );
  });

  it("includes dynamically discovered inactive View pages in full parity", async () => {
    const test = harness((request) => {
      const events = completeEpoch(request.reconciliationId);
      events.splice(4, 0, {
        reconciliationId: request.reconciliationId,
        chunk: {
          type: "active-first-page",
          page: { ...PAGE, target: INACTIVE_VIEW_SCOPE },
        },
      });
      events.splice(5, 0, {
        reconciliationId: request.reconciliationId,
        chunk: {
          type: "domain-complete",
          domain: "active-scope",
          target: INACTIVE_VIEW_SCOPE,
        },
      });
      return events;
    });
    hydrate(test.runtime);
    test.runtime.cacheUsable();
    test.runtime.sseConnectionChanged(true);
    test.runtime.start();

    await vi.waitFor(() =>
      expect(test.runtime.getState().trustedUpToDate).toBe(true),
    );
    expect(
      test.runtime.getState().targets[
        getReconciliationTargetKey(INACTIVE_VIEW_SCOPE)
      ]?.status,
    ).toBe("verified");
    expect(test.runtime.getState().latestFullEpoch?.requiredTargetKeys).toEqual(
      expect.arrayContaining([
        getReconciliationTargetKey(ACTIVE_SCOPE),
        getReconciliationTargetKey(INACTIVE_VIEW_SCOPE),
      ]),
    );
  });

  // Navigation streams concurrently with the View matrix, so a failed View
  // cell can arrive on either side of the navigation snapshot.
  it.each([
    { order: "before navigation", spliceIndex: 4 },
    { order: "after navigation", spliceIndex: 6 },
  ])(
    "keeps successful pages usable and retries a failed View cell streamed $order",
    async ({ spliceIndex }) => {
      vi.useFakeTimers();
      const test = harness((request) => {
        const events = completeEpoch(request.reconciliationId);
        events.splice(spliceIndex, 0, {
          reconciliationId: request.reconciliationId,
          chunk: {
            type: "domain-error",
            failure: {
              phase: "load-view-page",
              domain: "active-scope",
              target: INACTIVE_VIEW_SCOPE,
              message: "temporary View page failure",
            },
          },
        });
        return events;
      });
      hydrate(test.runtime);
      test.runtime.cacheUsable();
      test.runtime.sseConnectionChanged(true);
      test.runtime.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(test.applications).toEqual([
        "organization",
        "active-scope",
        "navigation",
      ]);
      expect(test.runtime.getState().serverParityAppliedAt).toBeNull();
      expect(test.runtime.getState().retryPending).toBe(true);
      expect(
        test.runtime.getState().targets[
          getReconciliationTargetKey(INACTIVE_VIEW_SCOPE)
        ]?.status,
      ).toBe("dirty");

      test.runtime.stop();
      vi.useRealTimers();
    },
  );

  it("restores full parity after a failed View cell succeeds on retry", async () => {
    vi.useFakeTimers();
    const test = harness((request) => {
      if (request.intent.type === "targeted") {
        return completeTargetedScope(
          request.reconciliationId,
          INACTIVE_VIEW_SCOPE,
        );
      }
      const events = completeEpoch(request.reconciliationId);
      events.splice(4, 0, {
        reconciliationId: request.reconciliationId,
        chunk: {
          type: "domain-error",
          failure: {
            phase: "load-view-page",
            domain: "active-scope",
            target: INACTIVE_VIEW_SCOPE,
            message: "temporary View page failure",
          },
        },
      });
      return events;
    });
    try {
      hydrate(test.runtime);
      test.runtime.cacheUsable();
      test.runtime.sseConnectionChanged(true);
      test.runtime.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(test.runtime.getState().serverParityAppliedAt).toBeNull();
      expect(test.runtime.getState().retryPending).toBe(true);

      await vi.advanceTimersByTimeAsync(1_000);

      expect(test.requests).toHaveLength(2);
      expect(test.requests[1]?.intent).toEqual({
        type: "targeted",
        targets: [INACTIVE_VIEW_SCOPE],
      });
      expect(
        test.runtime.getState().targets[
          getReconciliationTargetKey(INACTIVE_VIEW_SCOPE)
        ]?.status,
      ).toBe("verified");
      expect(test.runtime.getState().serverParityAppliedAt).not.toBeNull();
    } finally {
      test.runtime.stop();
      vi.useRealTimers();
    }
  });

  it("runs one follow-up full request when the first SSE connection is late", async () => {
    const test = harness((request) => completeEpoch(request.reconciliationId));
    hydrate(test.runtime);
    test.runtime.cacheUsable();
    test.runtime.start();
    await vi.waitFor(() =>
      expect(test.runtime.getState().serverParityAppliedAt).not.toBeNull(),
    );
    expect(test.requests).toHaveLength(1);

    test.setSelection(ACTIVE_SCOPE);
    test.runtime.sseConnectionChanged(true);
    await vi.waitFor(() => expect(test.requests).toHaveLength(2));
    expect(test.requests[1]?.intent).toEqual({
      type: "full",
      selectedScope: ACTIVE_SCOPE,
    });
  });

  it("does not request a verified scope again but full-reconciles after reconnect", async () => {
    const test = harness((request) => completeEpoch(request.reconciliationId));
    test.setSelection(ACTIVE_SCOPE);
    hydrate(test.runtime);
    test.runtime.cacheUsable();
    test.runtime.sseConnectionChanged(true);
    test.runtime.start();
    await vi.waitFor(() =>
      expect(test.runtime.getState().trustedUpToDate).toBe(true),
    );
    expect(test.requests).toHaveLength(1);

    test.runtime.activateScope(ACTIVE_SCOPE);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(test.requests).toHaveLength(1);

    test.runtime.sseConnectionChanged(false);
    test.runtime.sseConnectionChanged(true);
    await vi.waitFor(() => expect(test.requests).toHaveLength(2));
    expect(test.requests[1]?.intent).toEqual({
      type: "full",
      selectedScope: ACTIVE_SCOPE,
    });
  });

  it("preserves completed domains and withholds parity after a terminal error", async () => {
    const test = harness((request) => [
      {
        reconciliationId: request.reconciliationId,
        chunk: { type: "organization-snapshot", snapshot: ORGANIZATION },
      },
      {
        reconciliationId: request.reconciliationId,
        chunk: { type: "domain-complete", domain: "organization" },
      },
      {
        reconciliationId: request.reconciliationId,
        chunk: {
          type: "domain-error",
          failure: {
            phase: "load-active-scope",
            domain: "active-scope",
            target: ACTIVE_SCOPE,
            message: "failed page",
          },
        },
      },
    ]);
    hydrate(test.runtime);
    test.runtime.cacheUsable();
    test.runtime.sseConnectionChanged(true);
    test.runtime.start();

    await vi.waitFor(() => expect(test.applications).toEqual(["organization"]));
    expect(test.runtime.getState().domains.organization.status).toBe(
      "verified",
    );
    expect(test.runtime.getState().domains["active-scope"].status).toBe(
      "dirty",
    );
    expect(test.runtime.getState().serverParityAppliedAt).toBeNull();
    expect(test.runtime.getState().trustedUpToDate).toBe(false);
  });

  it("buffers live events until their persisted domains hydrate", () => {
    const test = harness(() => []);
    test.runtime.receiveLiveEvent(["newer-live-state"]);
    expect(test.liveApplications).toEqual([]);

    test.runtime.hydrationComplete("organization");
    test.runtime.hydrationComplete("active-scope");
    expect(test.liveApplications).toEqual([]);
    test.runtime.hydrationComplete("bookmarks");
    expect(test.liveApplications).toEqual([["newer-live-state"]]);
  });

  it("withholds established trust until a buffered live event finishes", async () => {
    const test = harness((request) => completeEpoch(request.reconciliationId));
    test.setSelection(ACTIVE_SCOPE);
    for (const domain of [
      "organization",
      "active-scope",
      "navigation",
    ] as const) {
      test.runtime.hydrationComplete(domain);
    }
    test.runtime.cacheUsable();
    test.runtime.sseConnectionChanged(true);
    test.runtime.start();
    await vi.waitFor(() =>
      expect(test.runtime.getState().trustedUpToDate).toBe(true),
    );

    test.runtime.receiveLiveEvent(["membership-change"]);
    expect(test.runtime.getState().trustedUpToDate).toBe(false);
    expect(test.liveApplications).toEqual([]);

    test.runtime.hydrationComplete("bookmarks");
    expect(test.liveApplications).toEqual([["membership-change"]]);
    expect(test.runtime.getState().trustedUpToDate).toBe(true);
  });

  it("keeps cold navigation authority behind a buffered live invalidation", async () => {
    let releaseRepair!: () => void;
    const repairReleased = new Promise<void>((resolve) => {
      releaseRepair = resolve;
    });
    const navigationTarget = { type: "navigation" } as const;
    const test = harness(
      async function* (request) {
        if (request.intent.type === "full") {
          yield* completeEpoch(request.reconciliationId);
          return;
        }
        await repairReleased;
        yield* completeTargetedScopeAndNavigation(request.reconciliationId);
      },
      () => ({
        repairTargets: [navigationTarget, ACTIVE_SCOPE],
        repairIntent: {
          type: "targeted",
          targets: [navigationTarget, ACTIVE_SCOPE],
        },
      }),
      {
        liveEventTargets: () => ({
          targets: [navigationTarget],
          affectsAllScopes: true,
        }),
      },
    );

    test.runtime.receiveLiveEvent(["navigation-membership-change"]);
    for (const domain of [
      "organization",
      "active-scope",
      "navigation",
    ] as const) {
      test.runtime.hydrationComplete(domain);
    }
    test.runtime.cacheUsable();
    test.runtime.sseConnectionChanged(true);
    test.runtime.start();

    await vi.waitFor(() => expect(test.requests).toHaveLength(1));
    await vi.waitFor(() => expect(test.applications).toEqual(["organization"]));
    expect(test.runtime.getState().trustedUpToDate).toBe(false);

    test.runtime.hydrationComplete("bookmarks");
    await vi.waitFor(() => expect(test.liveApplications).toHaveLength(1));
    await vi.waitFor(() => expect(test.requests).toHaveLength(2));
    expect(
      test.runtime.getState().targets.navigation?.revision,
    ).toBeGreaterThan(0);
    expect(
      test.runtime.getState().targets[getReconciliationTargetKey(ACTIVE_SCOPE)]
        ?.revision,
    ).toBeGreaterThan(0);
    expect(test.applications).toEqual(["organization"]);

    releaseRepair();
    await vi.waitFor(() =>
      expect(
        test.authoritativeApplications
          .filter((application) => application.type !== "organization")
          .map((application) => application.reconciliationId),
      ).toEqual([
        test.requests[1]?.reconciliationId,
        test.requests[1]?.reconciliationId,
      ]),
    );
    await vi.waitFor(() =>
      expect(test.runtime.getState().trustedUpToDate).toBe(true),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(test.requests).toHaveLength(2);
    expect(
      test.authoritativeApplications.filter(
        (application) => application.type !== "organization",
      ),
    ).toHaveLength(2);
  });

  it("withholds cold trust while RSS feed items wait for hydration", async () => {
    const navigationTarget = { type: "navigation" } as const;
    const test = harness(
      (request) => completeEpoch(request.reconciliationId),
      () => ({ dirtyTargets: [navigationTarget, ACTIVE_SCOPE] }),
      {
        liveEventTargets: () => ({
          targets: [navigationTarget],
          affectsAllScopes: true,
        }),
      },
    );

    test.runtime.receiveLiveEvent(["rss-feed-items"]);
    for (const domain of [
      "organization",
      "active-scope",
      "navigation",
    ] as const) {
      test.runtime.hydrationComplete(domain);
    }
    test.runtime.cacheUsable();
    test.runtime.sseConnectionChanged(true);
    test.runtime.start();

    await vi.waitFor(() => expect(test.requests).toHaveLength(1));
    await vi.waitFor(() => expect(test.applications).toEqual(["organization"]));
    expect(test.runtime.getState().trustedUpToDate).toBe(false);

    test.runtime.hydrationComplete("bookmarks");
    await vi.waitFor(() => expect(test.liveApplications).toHaveLength(1));
    expect(
      test.runtime.getState().targets.navigation?.revision,
    ).toBeGreaterThan(0);
    expect(
      test.runtime.getState().targets[getReconciliationTargetKey(ACTIVE_SCOPE)]
        ?.revision,
    ).toBeGreaterThan(0);
    test.runtime.stop();
  });

  it("keeps RSS detail events repair-silent and schedules one summary repair", async () => {
    const test = harness(
      (request) =>
        request.intent.type === "full"
          ? completeEpoch(request.reconciliationId)
          : [
              {
                reconciliationId: request.reconciliationId,
                chunk: { type: "active-first-page", page: PAGE },
              },
              {
                reconciliationId: request.reconciliationId,
                chunk: {
                  type: "domain-complete",
                  domain: "active-scope",
                  target: ACTIVE_SCOPE,
                },
              },
              {
                reconciliationId: request.reconciliationId,
                chunk: {
                  type: "epoch-complete",
                  requiredDomains: ["active-scope"],
                },
              },
            ],
      (payload) =>
        payload.includes("rss-attempt-complete")
          ? {
              repairTargets: [ACTIVE_SCOPE],
              repairIntent: {
                type: "targeted",
                targets: [ACTIVE_SCOPE],
              },
            }
          : undefined,
    );
    test.setSelection(ACTIVE_SCOPE);
    hydrate(test.runtime);
    test.runtime.cacheUsable();
    test.runtime.sseConnectionChanged(true);
    test.runtime.start();
    await vi.waitFor(() =>
      expect(test.runtime.getState().trustedUpToDate).toBe(true),
    );

    test.runtime.receiveLiveEvent(["feed-status", "feed-items"]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(test.requests).toHaveLength(1);

    test.runtime.receiveLiveEvent(["rss-attempt-complete"]);
    await vi.waitFor(() => expect(test.requests).toHaveLength(2));
    expect(test.requests[1]?.intent).toEqual({
      type: "targeted",
      targets: [ACTIVE_SCOPE],
    });
  });

  it("retains usable data and retries only the failed target with capped scheduling", async () => {
    vi.useFakeTimers();
    let targetedAttempt = 0;
    const test = harness(
      (request) => {
        if (request.intent.type === "full") {
          return completeEpoch(request.reconciliationId);
        }
        targetedAttempt++;
        return targetedAttempt === 1
          ? [
              {
                reconciliationId: request.reconciliationId,
                chunk: {
                  type: "domain-error",
                  failure: {
                    phase: "load-active-scope",
                    domain: "active-scope",
                    target: ACTIVE_SCOPE,
                    message: "temporary failure",
                  },
                },
              },
            ]
          : completeTargetedScope(request.reconciliationId);
      },
      () => ({
        repairTargets: [ACTIVE_SCOPE],
        repairIntent: { type: "targeted", targets: [ACTIVE_SCOPE] },
      }),
    );
    test.setSelection(ACTIVE_SCOPE);
    hydrate(test.runtime);
    test.runtime.cacheUsable();
    test.runtime.sseConnectionChanged(true);
    test.runtime.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(test.runtime.getState().trustedUpToDate).toBe(true);

    test.runtime.receiveLiveEvent(["mutation"]);
    await vi.advanceTimersByTimeAsync(0);
    expect(test.requests).toHaveLength(2);
    expect(test.runtime.getState().cacheUsableAt).not.toBeNull();
    expect(test.runtime.getState().trustedUpToDate).toBe(false);
    expect(test.runtime.getState().retryPending).toBe(true);

    await vi.runOnlyPendingTimersAsync();
    expect(test.requests).toHaveLength(3);
    expect(test.requests[2]?.intent).toEqual({
      type: "targeted",
      targets: [ACTIVE_SCOPE],
    });
    expect(test.runtime.getState().trustedUpToDate).toBe(true);
    expect(test.runtime.getState().retryPending).toBe(false);
    test.runtime.stop();
    vi.useRealTimers();
  });

  it("pauses recovery while hidden and coalesces refocus into one retry", async () => {
    vi.useFakeTimers();
    let visible = false;
    const test = harness(
      (request) =>
        request.intent.type === "full"
          ? [
              {
                reconciliationId: request.reconciliationId,
                chunk: {
                  type: "domain-error",
                  failure: {
                    phase: "load-navigation",
                    domain: "navigation",
                    message: "offline",
                  },
                },
              },
            ]
          : [],
      undefined,
      { isVisible: () => visible, isOnline: () => true },
    );
    hydrate(test.runtime);
    test.runtime.cacheUsable();
    test.runtime.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(test.requests).toHaveLength(1);
    expect(test.runtime.getState().retryPending).toBe(true);
    expect(test.runtime.getState().retryAt).toBeNull();

    visible = true;
    test.runtime.environmentChanged();
    await vi.advanceTimersByTimeAsync(0);
    expect(test.requests).toHaveLength(2);
    test.runtime.environmentChanged();
    await vi.advanceTimersByTimeAsync(0);
    expect(test.requests).toHaveLength(2);
    test.runtime.stop();
    vi.useRealTimers();
  });

  it("does not let an unrelated successful repair cancel a failed target retry", async () => {
    vi.useFakeTimers();
    let scopeAttempts = 0;
    const test = harness(
      (request) => {
        if (request.intent.type === "full") {
          return completeEpoch(request.reconciliationId);
        }
        const target = request.intent.targets[0];
        if (target?.type === "organization") {
          return completeTargetedOrganization(request.reconciliationId);
        }
        scopeAttempts++;
        return scopeAttempts === 1
          ? [
              {
                reconciliationId: request.reconciliationId,
                chunk: {
                  type: "domain-error",
                  failure: {
                    phase: "load-active-scope",
                    domain: "active-scope",
                    target: ACTIVE_SCOPE,
                    message: "temporary failure",
                  },
                },
              },
            ]
          : completeTargetedScope(request.reconciliationId);
      },
      (payload) => {
        const repairTargets: ReconciliationTarget[] = payload.includes(
          "scope-mutation",
        )
          ? [ACTIVE_SCOPE]
          : [{ type: "organization" }];
        return {
          repairTargets,
          repairIntent: { type: "targeted", targets: repairTargets },
        };
      },
    );
    test.setSelection(ACTIVE_SCOPE);
    hydrate(test.runtime);
    test.runtime.cacheUsable();
    test.runtime.sseConnectionChanged(true);
    test.runtime.start();
    await vi.advanceTimersByTimeAsync(0);

    test.runtime.receiveLiveEvent(["scope-mutation"]);
    await vi.advanceTimersByTimeAsync(0);
    expect(test.runtime.getState().retryPending).toBe(true);

    test.runtime.receiveLiveEvent(["organization-mutation"]);
    await vi.advanceTimersByTimeAsync(0);
    expect(test.requests).toHaveLength(3);
    expect(test.runtime.getState().retryPending).toBe(true);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(test.requests).toHaveLength(4);
    expect(test.requests[3]?.intent).toEqual({
      type: "targeted",
      targets: [ACTIVE_SCOPE],
    });
    expect(test.runtime.getState().retryPending).toBe(false);
    test.runtime.stop();
    vi.useRealTimers();
  });
});
