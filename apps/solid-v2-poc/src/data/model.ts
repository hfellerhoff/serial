import {
  action,
  createMemo,
  createOptimisticStore,
  createSignal,
  getOwner,
  refresh,
  runWithOwner,
  type Accessor,
  type Store,
} from 'solid-js';

import type {
  ContentStatus,
  FeedItem,
  FeedView,
  SetWatchLaterInput,
  SetWatchedInput,
  SolidFeedTransport,
  ViewItemsInput,
} from './transport';

export interface LoadedView extends FeedView {
  contentStatus: ContentStatus | null;
  itemIds: string[];
  loaded: boolean;
}

export interface FeedGraph {
  itemsById: Record<string, FeedItem>;
  viewsById: Record<number, LoadedView>;
  viewOrder: number[];
}

export interface SolidFeedModel {
  readonly graph: Store<FeedGraph>;
  readonly activeViews: () => readonly ViewItemsInput[];
  setActiveViews(scopes: readonly ViewItemsInput[]): void;
  projectView(viewId: number): Accessor<readonly Store<FeedItem>[]>;
  revalidate(): void;
  setWatched(input: SetWatchedInput): Promise<void>;
  setWatchLater(input: SetWatchLaterInput): Promise<void>;
}

interface MutationOperation<TInput> {
  input: TInput;
  revision: number;
}

interface MutationCoordinator<TInput> {
  nextRevision: number;
  pending: Set<number>;
  successful: Map<number, TInput>;
  lastSuccessfulCompletion: number | null;
}

const EMPTY_GRAPH: FeedGraph = {
  itemsById: {},
  viewsById: {},
  viewOrder: [],
};

function compareViews(left: FeedView, right: FeedView) {
  return left.placement - right.placement || left.id - right.id;
}

function scopeKey(scope: ViewItemsInput) {
  return `${scope.viewId}:${scope.contentStatus.saveStatus}:${scope.contentStatus.archiveStatus}`;
}

function deduplicateScopes(scopes: readonly ViewItemsInput[]) {
  const uniqueScopes = new Map<number, ViewItemsInput>();

  for (const scope of scopes) {
    if (uniqueScopes.has(scope.viewId)) {
      throw new Error(
        `The Solid PoC supports one active content-status page per View (duplicate View ${scope.viewId}).`,
      );
    }
    uniqueScopes.set(scope.viewId, scope);
  }

  return [...uniqueScopes.values()];
}

function createMutationCoordinator<TInput>(): MutationCoordinator<TInput> {
  return {
    nextRevision: 0,
    pending: new Set(),
    successful: new Map(),
    lastSuccessfulCompletion: null,
  };
}

function beginMutation<TInput>(
  coordinator: MutationCoordinator<TInput>,
  input: TInput,
): MutationOperation<TInput> {
  const revision = coordinator.nextRevision + 1;
  coordinator.nextRevision = revision;
  coordinator.pending.add(revision);
  return { input, revision };
}

function recordMutationSuccess<TInput>(
  coordinator: MutationCoordinator<TInput>,
  operation: MutationOperation<TInput>,
) {
  coordinator.pending.delete(operation.revision);
  coordinator.successful.set(operation.revision, operation.input);
  coordinator.lastSuccessfulCompletion = operation.revision;
}

function recordMutationFailure<TInput>(
  coordinator: MutationCoordinator<TInput>,
  operation: MutationOperation<TInput>,
) {
  coordinator.pending.delete(operation.revision);
}

function latestSuccessfulMutation<TInput>(
  coordinator: MutationCoordinator<TInput>,
): MutationOperation<TInput> | null {
  let latest: MutationOperation<TInput> | null = null;

  for (const [revision, input] of coordinator.successful) {
    if (!latest || revision > latest.revision) latest = { revision, input };
  }

  return latest;
}

function finishSettledBatch<TInput>(
  coordinator: MutationCoordinator<TInput>,
  latest: MutationOperation<TInput> | null,
) {
  if (coordinator.pending.size > 0) return false;

  coordinator.successful.clear();
  if (latest) coordinator.successful.set(latest.revision, latest.input);
  return true;
}

async function readGraphSnapshot(
  transport: SolidFeedTransport,
  scopes: readonly ViewItemsInput[],
): Promise<FeedGraph> {
  const [views, pages] = await Promise.all([
    transport.listViews(),
    Promise.all(
      scopes.map(async (scope) => ({
        scope,
        items: await transport.listViewItems(scope),
      })),
    ),
  ]);

  const itemsById: Record<string, FeedItem> = {};
  const pageByViewId = new Map(
    pages.map((page) => [page.scope.viewId, page] as const),
  );
  const viewsById: Record<number, LoadedView> = {};
  const sortedViews = [...views].sort(compareViews);

  for (const view of sortedViews) {
    const page = pageByViewId.get(view.id);
    const itemIds: string[] = [];
    const seenItemIds = new Set<string>();

    for (const item of page?.items ?? []) {
      itemsById[item.id] = item;
      if (!seenItemIds.has(item.id)) {
        seenItemIds.add(item.id);
        itemIds.push(item.id);
      }
    }

    viewsById[view.id] = {
      ...view,
      contentStatus: page?.scope.contentStatus ?? null,
      itemIds,
      loaded: page !== undefined,
    };
  }

  return {
    itemsById,
    viewsById,
    viewOrder: sortedViews.map((view) => view.id),
  };
}

/**
 * Creates one normalized, fine-grained graph. Every View projection resolves
 * IDs through the same `itemsById` store, so an Item field is written once.
 */
export function createSolidFeedModel(
  transport: SolidFeedTransport,
  initialScopes: readonly ViewItemsInput[] = [],
): SolidFeedModel {
  const modelOwner = getOwner();
  const [activeViews, setActiveViewSignal] = createSignal(
    deduplicateScopes(initialScopes),
    {
      equals: (previous, next) =>
        previous.length === next.length &&
        previous.every(
          (scope, index) => scopeKey(scope) === scopeKey(next[index]!),
        ),
    },
  );

  const [graph, setOptimisticGraph] = createOptimisticStore<FeedGraph>(
    () => readGraphSnapshot(transport, activeViews()),
    EMPTY_GRAPH,
    { key: null, seedLoadingValue: true },
  );

  const projections = new Map<number, Accessor<readonly Store<FeedItem>[]>>();
  const watchedMutations = new Map<
    string,
    MutationCoordinator<SetWatchedInput>
  >();
  const watchLaterMutations = new Map<
    string,
    MutationCoordinator<SetWatchLaterInput>
  >();
  let activeMutationCount = 0;

  function finishMutation(shouldRefresh: boolean) {
    activeMutationCount -= 1;
    if (shouldRefresh && activeMutationCount === 0) refresh(graph);
  }

  function setActiveViews(scopes: readonly ViewItemsInput[]) {
    setActiveViewSignal(deduplicateScopes(scopes));
  }

  function projectView(viewId: number) {
    const existingProjection = projections.get(viewId);
    if (existingProjection) return existingProjection;

    const createViewProjection = () =>
      createMemo<readonly Store<FeedItem>[]>(() => {
        const itemIds = graph.viewsById[viewId]?.itemIds ?? [];
        const items: Store<FeedItem>[] = [];

        for (const itemId of itemIds) {
          const item = graph.itemsById[itemId];
          if (item) items.push(item);
        }

        return items;
      });
    const projection = modelOwner
      ? runWithOwner(modelOwner, createViewProjection)
      : createViewProjection();

    projections.set(viewId, projection);
    return projection;
  }

  const setWatched = action(function* (
    input: SetWatchedInput,
  ): Generator<Promise<void>, void, void> {
    activeMutationCount += 1;
    let coordinator = watchedMutations.get(input.id);
    if (!coordinator) {
      coordinator = createMutationCoordinator();
      watchedMutations.set(input.id, coordinator);
    }
    const mutation = beginMutation(coordinator, input);

    setOptimisticGraph((draft) => {
      const item = draft.itemsById[input.id];
      if (item) item.isWatched = input.isWatched;
    });

    try {
      yield transport.setWatched(input);
      recordMutationSuccess(coordinator, mutation);
    } catch (error) {
      recordMutationFailure(coordinator, mutation);
      finishMutation(coordinator.pending.size === 0);
      throw error;
    }

    if (coordinator.pending.size > 0) {
      finishMutation(false);
      return;
    }

    const latest = latestSuccessfulMutation(coordinator);
    try {
      if (latest && latest.revision !== coordinator.lastSuccessfulCompletion) {
        yield transport.setWatched(latest.input);
        coordinator.lastSuccessfulCompletion = latest.revision;
      }
    } catch (error) {
      finishMutation(true);
      throw error;
    }

    finishMutation(finishSettledBatch(coordinator, latest));
  });

  const setWatchLater = action(function* (
    input: SetWatchLaterInput,
  ): Generator<Promise<void>, void, void> {
    activeMutationCount += 1;
    let coordinator = watchLaterMutations.get(input.id);
    if (!coordinator) {
      coordinator = createMutationCoordinator();
      watchLaterMutations.set(input.id, coordinator);
    }
    const mutation = beginMutation(coordinator, input);

    setOptimisticGraph((draft) => {
      const item = draft.itemsById[input.id];
      if (item) item.isWatchLater = input.isWatchLater;
    });

    try {
      yield transport.setWatchLater(input);
      recordMutationSuccess(coordinator, mutation);
    } catch (error) {
      recordMutationFailure(coordinator, mutation);
      finishMutation(coordinator.pending.size === 0);
      throw error;
    }

    if (coordinator.pending.size > 0) {
      finishMutation(false);
      return;
    }

    const latest = latestSuccessfulMutation(coordinator);
    try {
      if (latest && latest.revision !== coordinator.lastSuccessfulCompletion) {
        yield transport.setWatchLater(latest.input);
        coordinator.lastSuccessfulCompletion = latest.revision;
      }
    } catch (error) {
      finishMutation(true);
      throw error;
    }

    finishMutation(finishSettledBatch(coordinator, latest));
  });

  return {
    graph,
    activeViews,
    setActiveViews,
    projectView,
    revalidate: () => refresh(graph),
    setWatched,
    setWatchLater,
  };
}
