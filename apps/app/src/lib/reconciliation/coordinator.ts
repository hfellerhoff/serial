import {
  getReconciliationScopeKey,
  getReconciliationTargetKey,
  getRequiredTargetsForFullReconciliation,
  getTargetDomain,
  REQUIRED_RECONCILIATION_DOMAINS,
} from "./contracts";
import type {
  AutomaticRssOwner,
  ReconciliationRequestIntent,
  ReconciliationScopeTarget,
  ReconciliationTarget,
  RequiredReconciliationDomain,
} from "./contracts";

export type ReconciliationTargetStatus =
  "unverified" | "syncing" | "verified" | "dirty";

export type ReconciliationTargetState = {
  target: ReconciliationTarget;
  status: ReconciliationTargetStatus;
  revision: number;
  requestedReconciliationId: string | null;
  appliedAt: number | null;
  appliedReconciliationId: string | null;
};

export type ReconciliationDomainState = {
  status: ReconciliationTargetStatus;
  appliedAt: number | null;
};

export type ReconciliationRequestDescriptor = {
  reconciliationId: string;
  intent: ReconciliationRequestIntent;
  capturedRevisions: Record<string, number>;
};

type ReconciliationRequestRecord = ReconciliationRequestDescriptor & {
  targets: ReconciliationTarget[];
};

type FullEpoch = {
  reconciliationId: string;
  selectedScope: ReconciliationScopeTarget;
  requiredTargetKeys: string[];
  completed: boolean;
  established: boolean;
};

type BufferedAuthoritative<TAuthoritative> = {
  type: "authoritative";
  reconciliationId: string;
  target: ReconciliationTarget;
  targetKeys: string[];
  requiresHydration: RequiredReconciliationDomain[];
  payload: TAuthoritative;
};

type BufferedLiveEvent<TLiveEvent> = {
  type: "live-event";
  eventId: string;
  targetKeys: string[];
  requiresHydration: RequiredReconciliationDomain[];
  payload: TLiveEvent;
};

type BufferedApplication<TAuthoritative, TLiveEvent> =
  BufferedAuthoritative<TAuthoritative> | BufferedLiveEvent<TLiveEvent>;

export type ReconciliationCoordinatorState<
  TAuthoritative = unknown,
  TLiveEvent = unknown,
> = {
  sessionId: string;
  nextReconciliationSequence: number;
  inFlight: ReconciliationRequestDescriptor | null;
  trailingIntent: ReconciliationRequestIntent | null;
  requests: Record<string, ReconciliationRequestRecord>;
  targets: Record<string, ReconciliationTargetState>;
  scopes: Record<string, ReconciliationTargetState>;
  domains: Record<RequiredReconciliationDomain, ReconciliationDomainState>;
  dirtyTargets: Record<string, ReconciliationTarget>;
  hydratedDomains: Record<RequiredReconciliationDomain, boolean>;
  bufferedApplications: Array<BufferedApplication<TAuthoritative, TLiveEvent>>;
  latestFullEpoch: FullEpoch | null;
  cacheUsableAt: number | null;
  serverParityAppliedAt: number | null;
  sseConnected: boolean;
  automaticRssOwner: AutomaticRssOwner | null;
  trustedUpToDate: boolean;
};

export type ReconciliationCommand<TAuthoritative, TLiveEvent> =
  | {
      type: "start-reconciliation";
      request: ReconciliationRequestDescriptor;
    }
  | {
      type: "apply-authoritative";
      reconciliationId: string;
      target: ReconciliationTarget;
      payload: TAuthoritative;
    }
  | {
      type: "apply-live-event";
      eventId: string;
      payload: TLiveEvent;
    };

export type ReconciliationCoordinatorEvent<TAuthoritative, TLiveEvent> =
  | { type: "cache-usable"; at: number }
  | {
      type: "sse-connection-changed";
      connected: boolean;
    }
  | {
      type: "hydration-complete";
      domain: RequiredReconciliationDomain;
    }
  | {
      type: "request-reconciliation";
      intent: ReconciliationRequestIntent;
    }
  | {
      type: "authoritative-received";
      reconciliationId: string;
      target: ReconciliationTarget;
      requiresHydration: RequiredReconciliationDomain[];
      payload: TAuthoritative;
    }
  | {
      type: "authoritative-applied";
      reconciliationId: string;
      target: ReconciliationTarget;
      at: number;
    }
  | {
      type: "live-event-received";
      eventId: string;
      targets: ReconciliationTarget[];
      requiresHydration: RequiredReconciliationDomain[];
      payload?: TLiveEvent;
      invalidates?: ReconciliationTarget[];
      repairIntent?: ReconciliationRequestIntent;
    }
  | {
      type: "request-settled";
      reconciliationId: string;
      at: number;
      failedTargets?: ReconciliationTarget[];
    }
  | {
      type: "automatic-rss-owner-resolved";
      owner: AutomaticRssOwner;
    };

export type ReconciliationCoordinatorTransition<TAuthoritative, TLiveEvent> = {
  state: ReconciliationCoordinatorState<TAuthoritative, TLiveEvent>;
  commands: Array<ReconciliationCommand<TAuthoritative, TLiveEvent>>;
};

function initialDomainStates(): Record<
  RequiredReconciliationDomain,
  ReconciliationDomainState
> {
  return Object.fromEntries(
    REQUIRED_RECONCILIATION_DOMAINS.map((domain) => [
      domain,
      { status: "unverified", appliedAt: null },
    ]),
  ) as Record<RequiredReconciliationDomain, ReconciliationDomainState>;
}

function initialHydrationState(): Record<
  RequiredReconciliationDomain,
  boolean
> {
  return Object.fromEntries(
    REQUIRED_RECONCILIATION_DOMAINS.map((domain) => [domain, false]),
  ) as Record<RequiredReconciliationDomain, boolean>;
}

export function createReconciliationCoordinatorState<
  TAuthoritative = unknown,
  TLiveEvent = unknown,
>(
  sessionId: string,
): ReconciliationCoordinatorState<TAuthoritative, TLiveEvent> {
  return {
    sessionId,
    nextReconciliationSequence: 1,
    inFlight: null,
    trailingIntent: null,
    requests: {},
    targets: {},
    scopes: {},
    domains: initialDomainStates(),
    dirtyTargets: {},
    hydratedDomains: initialHydrationState(),
    bufferedApplications: [],
    latestFullEpoch: null,
    cacheUsableAt: null,
    serverParityAppliedAt: null,
    sseConnected: false,
    automaticRssOwner: null,
    trustedUpToDate: false,
  };
}

function requestTargets(intent: ReconciliationRequestIntent) {
  return intent.type === "full"
    ? getRequiredTargetsForFullReconciliation(intent.selectedScope)
    : intent.targets;
}

function uniqueTargets(targets: readonly ReconciliationTarget[]) {
  return [
    ...new Map(
      targets.map((target) => [getReconciliationTargetKey(target), target]),
    ).values(),
  ];
}

function mergeRequestIntents(
  current: ReconciliationRequestIntent | null,
  incoming: ReconciliationRequestIntent,
): ReconciliationRequestIntent {
  if (!current) return incoming;
  if (incoming.type === "full") return incoming;
  if (current.type === "full") return current;
  return {
    type: "targeted",
    targets: uniqueTargets([...current.targets, ...incoming.targets]),
  };
}

function targetState(
  state: ReconciliationCoordinatorState,
  target: ReconciliationTarget,
): ReconciliationTargetState {
  return (
    state.targets[getReconciliationTargetKey(target)] ?? {
      target,
      status: "unverified",
      revision: 0,
      requestedReconciliationId: null,
      appliedAt: null,
      appliedReconciliationId: null,
    }
  );
}

function withTargetState<TAuthoritative, TLiveEvent>(
  state: ReconciliationCoordinatorState<TAuthoritative, TLiveEvent>,
  nextTarget: ReconciliationTargetState,
) {
  const targetKey = getReconciliationTargetKey(nextTarget.target);
  const domain = getTargetDomain(nextTarget.target);
  return {
    ...state,
    targets: { ...state.targets, [targetKey]: nextTarget },
    scopes:
      nextTarget.target.type === "scope"
        ? {
            ...state.scopes,
            [getReconciliationScopeKey(nextTarget.target)]: nextTarget,
          }
        : state.scopes,
    domains: {
      ...state.domains,
      [domain]: {
        status: nextTarget.status,
        appliedAt: nextTarget.appliedAt,
      },
    },
  };
}

function startRequest<TAuthoritative, TLiveEvent>(
  state: ReconciliationCoordinatorState<TAuthoritative, TLiveEvent>,
  intent: ReconciliationRequestIntent,
): ReconciliationCoordinatorTransition<TAuthoritative, TLiveEvent> {
  const targets = uniqueTargets(requestTargets(intent));
  const reconciliationId = `${state.sessionId}:${state.nextReconciliationSequence}`;
  const capturedRevisions = Object.fromEntries(
    targets.map((target) => [
      getReconciliationTargetKey(target),
      targetState(state, target).revision,
    ]),
  );
  const descriptor = { reconciliationId, intent, capturedRevisions };
  let nextState: ReconciliationCoordinatorState<TAuthoritative, TLiveEvent> = {
    ...state,
    nextReconciliationSequence: state.nextReconciliationSequence + 1,
    inFlight: descriptor,
    requests: {
      ...state.requests,
      [reconciliationId]: { ...descriptor, targets },
    },
  };
  for (const target of targets) {
    nextState = withTargetState(nextState, {
      ...targetState(nextState, target),
      status: "syncing",
      requestedReconciliationId: reconciliationId,
    });
  }
  if (intent.type === "full") {
    nextState = {
      ...nextState,
      latestFullEpoch: {
        reconciliationId,
        selectedScope: intent.selectedScope,
        requiredTargetKeys: targets.map(getReconciliationTargetKey),
        completed: false,
        established: false,
      },
      serverParityAppliedAt: null,
    };
  }
  return {
    state: withDerivedTrust(nextState),
    commands: [{ type: "start-reconciliation", request: descriptor }],
  };
}

function enqueueRequest<TAuthoritative, TLiveEvent>(
  state: ReconciliationCoordinatorState<TAuthoritative, TLiveEvent>,
  intent: ReconciliationRequestIntent,
): ReconciliationCoordinatorTransition<TAuthoritative, TLiveEvent> {
  if (!state.inFlight) return startRequest(state, intent);
  return {
    state: withDerivedTrust({
      ...state,
      trailingIntent: mergeRequestIntents(state.trailingIntent, intent),
    }),
    commands: [],
  };
}

function repairIntentFor<TAuthoritative, TLiveEvent>(
  state: ReconciliationCoordinatorState<TAuthoritative, TLiveEvent>,
  targets: ReconciliationTarget[],
): ReconciliationRequestIntent {
  const fullEpoch = state.latestFullEpoch;
  return fullEpoch && !fullEpoch.established
    ? { type: "full", selectedScope: fullEpoch.selectedScope }
    : { type: "targeted", targets: uniqueTargets(targets) };
}

function markTargetsDirty<TAuthoritative, TLiveEvent>(
  state: ReconciliationCoordinatorState<TAuthoritative, TLiveEvent>,
  targets: readonly ReconciliationTarget[],
  advanceRevision: boolean,
) {
  let nextState = state;
  const dirtyTargets = { ...state.dirtyTargets };
  for (const target of uniqueTargets(targets)) {
    const targetKey = getReconciliationTargetKey(target);
    const current = targetState(nextState, target);
    dirtyTargets[targetKey] = target;
    nextState = withTargetState(nextState, {
      ...current,
      status: "dirty",
      revision: current.revision + (advanceRevision ? 1 : 0),
    });
  }
  return withDerivedTrust({ ...nextState, dirtyTargets });
}

function isHydrated<TAuthoritative, TLiveEvent>(
  state: ReconciliationCoordinatorState<TAuthoritative, TLiveEvent>,
  domains: readonly RequiredReconciliationDomain[],
) {
  return domains.every((domain) => state.hydratedDomains[domain]);
}

function targetKeysOverlap(left: readonly string[], right: Set<string>) {
  return left.some((key) => right.has(key));
}

function requestRevisionIsCurrent<TAuthoritative, TLiveEvent>(
  state: ReconciliationCoordinatorState<TAuthoritative, TLiveEvent>,
  reconciliationId: string,
  target: ReconciliationTarget,
) {
  const targetKey = getReconciliationTargetKey(target);
  const capturedRevision =
    state.requests[reconciliationId]?.capturedRevisions[targetKey];
  return (
    capturedRevision !== undefined &&
    capturedRevision === targetState(state, target).revision &&
    targetState(state, target).requestedReconciliationId === reconciliationId
  );
}

function bufferApplication<TAuthoritative, TLiveEvent>(
  state: ReconciliationCoordinatorState<TAuthoritative, TLiveEvent>,
  application: BufferedApplication<TAuthoritative, TLiveEvent>,
) {
  return withDerivedTrust({
    ...state,
    bufferedApplications: [...state.bufferedApplications, application],
  });
}

function flushBufferedApplications<TAuthoritative, TLiveEvent>(
  state: ReconciliationCoordinatorState<TAuthoritative, TLiveEvent>,
): ReconciliationCoordinatorTransition<TAuthoritative, TLiveEvent> {
  const blockedTargetKeys = new Set<string>();
  const remaining: Array<BufferedApplication<TAuthoritative, TLiveEvent>> = [];
  const commands: Array<ReconciliationCommand<TAuthoritative, TLiveEvent>> = [];
  const staleTargets: ReconciliationTarget[] = [];
  for (const application of state.bufferedApplications) {
    const blocked =
      !isHydrated(state, application.requiresHydration) ||
      targetKeysOverlap(application.targetKeys, blockedTargetKeys);
    if (blocked) {
      remaining.push(application);
      for (const targetKey of application.targetKeys) {
        blockedTargetKeys.add(targetKey);
      }
      continue;
    }
    if (application.type === "live-event") {
      commands.push({
        type: "apply-live-event",
        eventId: application.eventId,
        payload: application.payload,
      });
      continue;
    }
    if (
      !requestRevisionIsCurrent(
        state,
        application.reconciliationId,
        application.target,
      )
    ) {
      staleTargets.push(application.target);
      continue;
    }
    commands.push({
      type: "apply-authoritative",
      reconciliationId: application.reconciliationId,
      target: application.target,
      payload: application.payload,
    });
  }
  let nextState = withDerivedTrust({
    ...state,
    bufferedApplications: remaining,
  });
  if (staleTargets.length === 0) return { state: nextState, commands };
  nextState = markTargetsDirty(nextState, staleTargets, false);
  const queued = enqueueRequest(
    nextState,
    repairIntentFor(nextState, staleTargets),
  );
  return { state: queued.state, commands: [...commands, ...queued.commands] };
}

function fullEpochIsApplied<TAuthoritative, TLiveEvent>(
  state: ReconciliationCoordinatorState<TAuthoritative, TLiveEvent>,
) {
  const fullEpoch = state.latestFullEpoch;
  if (!fullEpoch?.completed) return false;
  return fullEpoch.requiredTargetKeys.every((targetKey) => {
    const target = state.targets[targetKey];
    return (
      target?.status === "verified" &&
      target.appliedReconciliationId === fullEpoch.reconciliationId
    );
  });
}

function withEstablishedFullParity<TAuthoritative, TLiveEvent>(
  state: ReconciliationCoordinatorState<TAuthoritative, TLiveEvent>,
  at: number,
) {
  if (!fullEpochIsApplied(state) || !state.latestFullEpoch) return state;
  return {
    ...state,
    latestFullEpoch: { ...state.latestFullEpoch, established: true },
    serverParityAppliedAt: at,
  };
}

function deriveTrustedUpToDate<TAuthoritative, TLiveEvent>(
  state: ReconciliationCoordinatorState<TAuthoritative, TLiveEvent>,
) {
  const hasBufferedAuthoritative = state.bufferedApplications.some(
    (application) => application.type === "authoritative",
  );
  return Boolean(
    state.cacheUsableAt !== null &&
    state.latestFullEpoch?.established &&
    state.serverParityAppliedAt !== null &&
    state.sseConnected &&
    Object.keys(state.dirtyTargets).length === 0 &&
    !hasBufferedAuthoritative,
  );
}

function withDerivedTrust<TAuthoritative, TLiveEvent>(
  state: ReconciliationCoordinatorState<TAuthoritative, TLiveEvent>,
) {
  const trustedUpToDate = deriveTrustedUpToDate(state);
  return state.trustedUpToDate === trustedUpToDate
    ? state
    : { ...state, trustedUpToDate };
}

export function transitionReconciliation<TAuthoritative, TLiveEvent>(
  state: ReconciliationCoordinatorState<TAuthoritative, TLiveEvent>,
  event: ReconciliationCoordinatorEvent<TAuthoritative, TLiveEvent>,
): ReconciliationCoordinatorTransition<TAuthoritative, TLiveEvent> {
  switch (event.type) {
    case "cache-usable":
      return {
        state: withDerivedTrust({ ...state, cacheUsableAt: event.at }),
        commands: [],
      };
    case "sse-connection-changed":
      return {
        state: withDerivedTrust({
          ...state,
          sseConnected: event.connected,
        }),
        commands: [],
      };
    case "automatic-rss-owner-resolved":
      return {
        state: { ...state, automaticRssOwner: event.owner },
        commands: [],
      };
    case "hydration-complete": {
      const hydratedState = {
        ...state,
        hydratedDomains: {
          ...state.hydratedDomains,
          [event.domain]: true,
        },
      };
      return flushBufferedApplications(hydratedState);
    }
    case "request-reconciliation":
      return enqueueRequest(state, event.intent);
    case "authoritative-received": {
      if (
        !requestRevisionIsCurrent(state, event.reconciliationId, event.target)
      ) {
        const dirtyState = markTargetsDirty(state, [event.target], false);
        return enqueueRequest(
          dirtyState,
          repairIntentFor(dirtyState, [event.target]),
        );
      }
      const targetKeys = [getReconciliationTargetKey(event.target)];
      const hasEarlierBlockedTarget = state.bufferedApplications.some(
        (application) =>
          targetKeysOverlap(application.targetKeys, new Set(targetKeys)),
      );
      if (
        !isHydrated(state, event.requiresHydration) ||
        hasEarlierBlockedTarget
      ) {
        return {
          state: bufferApplication(state, {
            type: "authoritative",
            reconciliationId: event.reconciliationId,
            target: event.target,
            targetKeys,
            requiresHydration: event.requiresHydration,
            payload: event.payload,
          }),
          commands: [],
        };
      }
      return {
        state,
        commands: [
          {
            type: "apply-authoritative",
            reconciliationId: event.reconciliationId,
            target: event.target,
            payload: event.payload,
          },
        ],
      };
    }
    case "authoritative-applied": {
      if (
        !requestRevisionIsCurrent(state, event.reconciliationId, event.target)
      ) {
        const dirtyState = markTargetsDirty(state, [event.target], false);
        return enqueueRequest(
          dirtyState,
          repairIntentFor(dirtyState, [event.target]),
        );
      }
      const targetKey = getReconciliationTargetKey(event.target);
      const dirtyTargets = { ...state.dirtyTargets };
      delete dirtyTargets[targetKey];
      let nextState = withTargetState(state, {
        ...targetState(state, event.target),
        status: "verified",
        appliedAt: event.at,
        appliedReconciliationId: event.reconciliationId,
      });
      nextState = { ...nextState, dirtyTargets };
      nextState = withEstablishedFullParity(nextState, event.at);
      return { state: withDerivedTrust(nextState), commands: [] };
    }
    case "live-event-received": {
      let nextState = state;
      let commands: Array<ReconciliationCommand<TAuthoritative, TLiveEvent>> =
        [];
      const invalidatedTargets = event.invalidates ?? [];
      if (invalidatedTargets.length > 0) {
        nextState = markTargetsDirty(nextState, invalidatedTargets, true);
        const repairIntent =
          event.repairIntent ?? repairIntentFor(nextState, invalidatedTargets);
        const queued = enqueueRequest(nextState, repairIntent);
        nextState = queued.state;
        commands = queued.commands;
      }
      if (event.payload === undefined) {
        return { state: withDerivedTrust(nextState), commands };
      }
      const targetKeys = event.targets.map(getReconciliationTargetKey);
      const targetKeySet = new Set(targetKeys);
      const hasEarlierBlockedTarget = nextState.bufferedApplications.some(
        (application) =>
          application.targetKeys.some((targetKey) =>
            targetKeySet.has(targetKey),
          ),
      );
      if (
        !isHydrated(nextState, event.requiresHydration) ||
        hasEarlierBlockedTarget
      ) {
        return {
          state: bufferApplication(nextState, {
            type: "live-event",
            eventId: event.eventId,
            targetKeys,
            requiresHydration: event.requiresHydration,
            payload: event.payload,
          }),
          commands,
        };
      }
      return {
        state: nextState,
        commands: [
          ...commands,
          {
            type: "apply-live-event",
            eventId: event.eventId,
            payload: event.payload,
          },
        ],
      };
    }
    case "request-settled": {
      let nextState = state;
      if (event.failedTargets && event.failedTargets.length > 0) {
        nextState = markTargetsDirty(nextState, event.failedTargets, false);
      }
      if (
        nextState.latestFullEpoch?.reconciliationId ===
          event.reconciliationId &&
        (!event.failedTargets || event.failedTargets.length === 0)
      ) {
        nextState = withEstablishedFullParity(
          {
            ...nextState,
            latestFullEpoch: {
              ...nextState.latestFullEpoch,
              completed: true,
            },
          },
          event.at,
        );
      }
      if (nextState.inFlight?.reconciliationId !== event.reconciliationId) {
        return { state: withDerivedTrust(nextState), commands: [] };
      }
      const trailingIntent = nextState.trailingIntent;
      nextState = {
        ...nextState,
        inFlight: null,
        trailingIntent: null,
      };
      return trailingIntent
        ? startRequest(nextState, trailingIntent)
        : { state: withDerivedTrust(nextState), commands: [] };
    }
  }
}
