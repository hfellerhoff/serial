import { createRoot } from 'solid-js';
import { afterEach, describe, expect, it } from 'vitest';

import { createSolidFeedModel, type SolidFeedModel } from './model';
import type {
  FeedItem,
  FeedView,
  SetWatchLaterInput,
  SetWatchedInput,
  SolidFeedTransport,
  ViewItemsInput,
} from './transport';

const UNREAD = {
  saveStatus: 'inbox',
  archiveStatus: 'unread',
} as const;
const ARCHIVED = {
  saveStatus: 'inbox',
  archiveStatus: 'archived',
} as const;

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  const date = new Date('2026-08-16T12:00:00.000Z');

  return {
    id: 'item-1',
    feedId: 7,
    contentId: 'video-1',
    title: 'One shared item',
    author: 'Serial',
    url: 'https://example.com/item-1',
    thumbnail: 'https://example.com/item-1.jpg',
    content: '',
    contentSnippet: 'A deterministic fixture',
    contentType: 'video',
    platform: 'youtube',
    orientation: 'horizontal',
    isWatched: false,
    isWatchedUpdatedAt: null,
    isWatchLater: false,
    isWatchLaterUpdatedAt: null,
    progress: 0,
    duration: 300,
    postedAt: date,
    createdAt: date,
    updatedAt: date,
    contentHash: null,
    ...overrides,
  };
}

const VIEWS: readonly FeedView[] = [
  { id: 1, name: 'Everything', placement: 0, layout: 'list' },
  { id: 2, name: 'Videos', placement: 1, layout: 'grid' },
];

class Deferred {
  readonly promise: Promise<void>;
  resolve!: () => void;
  reject!: (reason: unknown) => void;

  constructor() {
    this.promise = new Promise<void>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

class DeterministicTransport implements SolidFeedTransport {
  readonly watchedRequests: Array<{
    input: SetWatchedInput;
    deferred: Deferred;
  }> = [];
  readonly watchLaterRequests: Array<{
    input: SetWatchLaterInput;
    deferred: Deferred;
  }> = [];
  readonly pageReads: ViewItemsInput[] = [];
  readonly items = new Map<string, FeedItem>([['item-1', makeItem()]]);
  readonly membership = new Map<number, readonly string[]>([
    [1, ['item-1']],
    [2, ['item-1']],
  ]);

  async listViews() {
    return VIEWS;
  }

  async listViewItems(input: ViewItemsInput) {
    this.pageReads.push(input);
    const ids = this.membership.get(input.viewId) ?? [];

    return ids.flatMap((id) => {
      const item = this.items.get(id);
      if (!item) return [];

      const matchesStatus =
        item.isWatchLater === (input.contentStatus.saveStatus === 'saved') &&
        item.isWatched === (input.contentStatus.archiveStatus === 'archived');
      return matchesStatus ? [{ ...item }] : [];
    });
  }

  setWatched(input: SetWatchedInput) {
    const deferred = new Deferred();
    this.watchedRequests.push({ input, deferred });
    return deferred.promise;
  }

  setWatchLater(input: SetWatchLaterInput) {
    const deferred = new Deferred();
    this.watchLaterRequests.push({ input, deferred });
    return deferred.promise;
  }

  resolveWatched(index: number) {
    const request = this.watchedRequests[index];
    if (!request) throw new Error(`Missing watched request ${index}`);

    const item = this.items.get(request.input.id);
    if (!item) throw new Error(`Missing Item ${request.input.id}`);

    this.items.set(item.id, {
      ...item,
      isWatched: request.input.isWatched,
      isWatchedUpdatedAt: request.input.isWatched ? new Date() : null,
      updatedAt: new Date(),
    });
    request.deferred.resolve();
  }
}

const disposals: Array<() => void> = [];

afterEach(() => {
  for (const dispose of disposals.splice(0)) dispose();
});

function createModel(transport: SolidFeedTransport) {
  return createRoot((dispose) => {
    disposals.push(dispose);
    return createSolidFeedModel(transport, [
      { viewId: 1, contentStatus: UNREAD },
      { viewId: 2, contentStatus: UNREAD },
    ]);
  });
}

async function waitUntil(assertion: () => boolean, message: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (assertion()) return;
    await new Promise<void>((resolve) => queueMicrotask(resolve));
  }

  throw new Error(`Timed out waiting for ${message}`);
}

async function waitForInitialItems(model: SolidFeedModel) {
  await waitUntil(
    () =>
      model.graph.viewsById[1]?.loaded === true &&
      model.graph.viewsById[2]?.loaded === true,
    'the initial View pages',
  );
}

describe('Solid Feed model', () => {
  it('normalizes an Item once and projects the same reactive entity into overlapping Views', async () => {
    const transport = new DeterministicTransport();
    const model = createModel(transport);
    await waitForInitialItems(model);

    const firstView = model.projectView(1);
    const secondView = model.projectView(2);
    await waitUntil(
      () => firstView().length === 1 && secondView().length === 1,
      'both View projections',
    );

    expect(firstView()[0]).toBe(secondView()[0]);
    expect(firstView()[0]).toBe(model.graph.itemsById['item-1']);
    expect(model.graph.viewsById[1]?.itemIds).toEqual(['item-1']);
    expect(model.graph.viewsById[2]?.itemIds).toEqual(['item-1']);
  });

  it('shows one optimistic write in every occurrence before transport settles, then reconciles server membership', async () => {
    const transport = new DeterministicTransport();
    const model = createModel(transport);
    await waitForInitialItems(model);

    const firstView = model.projectView(1);
    const secondView = model.projectView(2);
    await waitUntil(() => firstView().length === 1, 'the first projection');

    const firstOccurrence = firstView()[0]!;
    const secondOccurrence = secondView()[0]!;
    const mutation = model.setWatched({
      id: firstOccurrence.id,
      feedId: firstOccurrence.feedId,
      isWatched: true,
    });

    await waitUntil(
      () => firstOccurrence.isWatched && secondOccurrence.isWatched,
      'the shared optimistic value',
    );
    expect(transport.watchedRequests).toHaveLength(1);

    transport.resolveWatched(0);
    await mutation;
    await waitUntil(
      () => firstView().length === 0 && secondView().length === 0,
      'authoritative unread membership',
    );

    model.setActiveViews([
      { viewId: 1, contentStatus: ARCHIVED },
      { viewId: 2, contentStatus: ARCHIVED },
    ]);
    await waitUntil(
      () => firstView().length === 1 && secondView().length === 1,
      'authoritative archived membership',
    );
    expect(firstView()[0]).toBe(secondView()[0]);
    expect(firstView()[0]?.isWatched).toBe(true);
  });

  it('rolls every occurrence back when the mutation rejects', async () => {
    const transport = new DeterministicTransport();
    const model = createModel(transport);
    await waitForInitialItems(model);

    const firstView = model.projectView(1);
    const secondView = model.projectView(2);
    await waitUntil(() => firstView().length === 1, 'the first projection');
    const firstOccurrence = firstView()[0]!;
    const secondOccurrence = secondView()[0]!;

    const mutation = model.setWatched({
      id: firstOccurrence.id,
      feedId: firstOccurrence.feedId,
      isWatched: true,
    });
    await waitUntil(
      () => firstOccurrence.isWatched && secondOccurrence.isWatched,
      'the optimistic value',
    );

    transport.watchedRequests[0]!.deferred.reject(new Error('offline'));
    await expect(mutation).rejects.toThrow('offline');
    await waitUntil(
      () => !firstOccurrence.isWatched && !secondOccurrence.isWatched,
      'the automatic rollback',
    );

    expect(firstView()).toHaveLength(1);
    expect(secondView()).toHaveLength(1);
  });

  it('revalidates stale Item data through the same graph', async () => {
    const transport = new DeterministicTransport();
    const model = createModel(transport);
    await waitForInitialItems(model);

    const firstView = model.projectView(1);
    const secondView = model.projectView(2);
    await waitUntil(() => firstView().length === 1, 'the first projection');

    transport.items.set(
      'item-1',
      makeItem({ title: 'Changed by another client' }),
    );
    model.revalidate();

    await waitUntil(
      () =>
        firstView()[0]?.title === 'Changed by another client' &&
        secondView()[0]?.title === 'Changed by another client',
      'the refreshed server snapshot',
    );
    expect(firstView()[0]).toBe(secondView()[0]);
  });

  it('does not let an older response overwrite a newer intent', async () => {
    const transport = new DeterministicTransport();
    const model = createModel(transport);
    await waitForInitialItems(model);

    const firstView = model.projectView(1);
    const secondView = model.projectView(2);
    await waitUntil(() => firstView().length === 1, 'the first projection');
    const item = firstView()[0]!;

    const olderMutation = model.setWatched({
      id: item.id,
      feedId: item.feedId,
      isWatched: true,
    });
    await waitUntil(() => item.isWatched, 'the older optimistic intent');

    const newerMutation = model.setWatched({
      id: item.id,
      feedId: item.feedId,
      isWatched: false,
    });
    await waitUntil(() => !item.isWatched, 'the newer optimistic intent');

    transport.resolveWatched(1);
    transport.resolveWatched(0);
    await waitUntil(
      () => transport.watchedRequests.length === 3,
      'the corrective write for the newer intent',
    );
    expect(transport.watchedRequests[2]?.input.isWatched).toBe(false);
    transport.resolveWatched(2);
    await Promise.all([olderMutation, newerMutation]);
    await waitUntil(
      () =>
        firstView()[0]?.isWatched === false &&
        secondView()[0]?.isWatched === false,
      'the newer intent after the older response',
    );

    expect(firstView()[0]).toBe(secondView()[0]);
    expect(model.graph.itemsById['item-1']?.isWatched).toBe(false);
  });

  it('converges to an older successful write when the newer intent fails', async () => {
    const transport = new DeterministicTransport();
    const model = createModel(transport);
    await waitForInitialItems(model);

    const firstView = model.projectView(1);
    const secondView = model.projectView(2);
    await waitUntil(() => firstView().length === 1, 'the first projection');
    const item = firstView()[0]!;

    const successfulMutation = model.setWatched({
      id: item.id,
      feedId: item.feedId,
      isWatched: true,
    });
    await waitUntil(() => item.isWatched, 'the first optimistic intent');

    const failedMutation = model.setWatched({
      id: item.id,
      feedId: item.feedId,
      isWatched: false,
    });
    await waitUntil(() => !item.isWatched, 'the second optimistic intent');

    transport.resolveWatched(0);
    await successfulMutation;
    transport.watchedRequests[1]!.deferred.reject(new Error('offline'));
    await expect(failedMutation).rejects.toThrow('offline');
    await waitUntil(
      () => firstView().length === 0 && secondView().length === 0,
      'the successful archived server state',
    );

    model.setActiveViews([
      { viewId: 1, contentStatus: ARCHIVED },
      { viewId: 2, contentStatus: ARCHIVED },
    ]);
    await waitUntil(
      () =>
        firstView()[0]?.isWatched === true &&
        secondView()[0]?.isWatched === true,
      'the prior successful value after rollback',
    );
    expect(firstView()[0]).toBe(secondView()[0]);
  });

  it('keeps an unrelated optimistic field visible while another field settles', async () => {
    const transport = new DeterministicTransport();
    const model = createModel(transport);
    await waitForInitialItems(model);

    const item = model.projectView(1)()[0]!;
    const watchedMutation = model.setWatched({
      id: item.id,
      feedId: item.feedId,
      isWatched: true,
    });
    const watchLaterMutation = model.setWatchLater({
      id: item.id,
      feedId: item.feedId,
      isWatchLater: true,
    });
    await waitUntil(
      () => item.isWatched && item.isWatchLater,
      'both optimistic fields',
    );

    transport.resolveWatched(0);
    await watchedMutation;
    expect(item.isWatchLater).toBe(true);

    transport.watchLaterRequests[0]!.deferred.reject(new Error('offline'));
    await expect(watchLaterMutation).rejects.toThrow('offline');
    await waitUntil(
      () => model.projectView(1)().length === 0,
      'the successful archived membership',
    );

    model.setActiveViews([
      { viewId: 1, contentStatus: ARCHIVED },
      { viewId: 2, contentStatus: ARCHIVED },
    ]);
    await waitUntil(
      () =>
        model.projectView(1)()[0]?.isWatched === true &&
        model.projectView(1)()[0]?.isWatchLater === false,
      'the successful field and unrelated rollback',
    );
  });
});
