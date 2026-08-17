import { createFileRoute } from '@tanstack/solid-router';
import {
  Errored,
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  isPending,
  type Store,
} from 'solid-js';

import {
  createSolidFeedModel,
  type ContentStatus,
  type FeedItem,
  type SolidFeedModel,
} from '../data';
import { orpcTransport } from '../data/orpc';

const DEFAULT_STATUS: ContentStatus = {
  saveStatus: 'inbox',
  archiveStatus: 'unread',
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'The request failed.';
}

function countProjectedItems(
  model: SolidFeedModel,
  viewIds: readonly number[],
) {
  const counts = new Map<string, number>();

  for (const viewId of viewIds) {
    for (const item of model.projectView(viewId)()) {
      counts.set(item.id, (counts.get(item.id) ?? 0) + 1);
    }
  }

  return counts;
}

function ItemCard(props: {
  item: Store<FeedItem>;
  model: SolidFeedModel;
  occurrences: number;
}) {
  const [mutationError, setMutationError] = createSignal<string>();

  function runMutation(mutation: Promise<void>) {
    setMutationError(undefined);
    void mutation.catch((error: unknown) =>
      setMutationError(errorMessage(error)),
    );
  }

  return (
    <article class="item-card" data-item-id={props.item.id}>
      <div class="item-copy">
        <div class="item-meta">
          <span>{props.item.author || props.item.platform}</span>
          <span aria-hidden="true">·</span>
          <span>
            {props.occurrences === 1
              ? 'one projection'
              : `${props.occurrences} projections`}
          </span>
        </div>
        <a
          class="item-title"
          href={props.item.url}
          target="_blank"
          rel="noreferrer"
        >
          {props.item.title}
        </a>
        <Show when={props.item.contentSnippet}>
          <p class="item-snippet">{props.item.contentSnippet}</p>
        </Show>
      </div>

      <div class="item-actions">
        <button
          class={`small-button${props.item.isWatchLater ? ' active' : ''}`}
          type="button"
          aria-pressed={props.item.isWatchLater ? 'true' : 'false'}
          aria-busy={
            isPending(() => props.item.isWatchLater) ? 'true' : 'false'
          }
          onClick={() =>
            runMutation(
              props.model.setWatchLater({
                id: props.item.id,
                feedId: props.item.feedId,
                isWatchLater: !props.item.isWatchLater,
              }),
            )
          }
        >
          Save
        </button>
        <button
          class={`small-button${props.item.isWatched ? ' active' : ''}`}
          type="button"
          aria-pressed={props.item.isWatched ? 'true' : 'false'}
          aria-busy={isPending(() => props.item.isWatched) ? 'true' : 'false'}
          onClick={() =>
            runMutation(
              props.model.setWatched({
                id: props.item.id,
                feedId: props.item.feedId,
                isWatched: !props.item.isWatched,
              }),
            )
          }
        >
          Archive
        </button>
      </div>

      <Show when={mutationError()}>
        <p class="inline-error" role="alert">
          {mutationError()}
        </p>
      </Show>
    </article>
  );
}

function ViewPanel(props: {
  viewId: number;
  model: SolidFeedModel;
  occurrenceCount: (itemId: string) => number;
}) {
  const items = props.model.projectView(props.viewId);
  const view = () => props.model.graph.viewsById[props.viewId];

  return (
    <section class="view-panel" aria-labelledby={`view-${props.viewId}`}>
      <div class="view-heading">
        <div>
          <p class="eyebrow">Reactive View projection</p>
          <h2 id={`view-${props.viewId}`}>{view()?.name ?? 'Loading View'}</h2>
        </div>
        <span class="count-pill">{items().length}</span>
      </div>

      <div class="item-list">
        <For
          each={items()}
          fallback={
            <p class="empty-state">
              No items match this View and content-status scope.
            </p>
          }
        >
          {(item) => (
            <ItemCard
              item={item}
              model={props.model}
              occurrences={props.occurrenceCount(item.id)}
            />
          )}
        </For>
      </div>
    </section>
  );
}

function SignalGraphDemo() {
  const model: SolidFeedModel = createSolidFeedModel(orpcTransport);
  const [selectedViewIds, setSelectedViewIds] = createSignal<number[]>([]);
  const [contentStatus, setContentStatus] =
    createSignal<ContentStatus>(DEFAULT_STATUS);
  let initializedViews = false;

  createEffect(
    () => [...model.graph.viewOrder],
    (viewIds) => {
      if (initializedViews || viewIds.length === 0) return;

      initializedViews = true;
      setSelectedViewIds(viewIds.slice(0, 2));
    },
  );

  createEffect(
    () => {
      const status = contentStatus();
      return {
        viewIds: [...selectedViewIds()],
        saveStatus: status.saveStatus,
        archiveStatus: status.archiveStatus,
      };
    },
    ({ viewIds, saveStatus, archiveStatus }) => {
      const status = { saveStatus, archiveStatus };
      model.setActiveViews(
        viewIds.map((viewId) => ({ viewId, contentStatus: status })),
      );
    },
  );

  const occurrenceCounts = createMemo(() =>
    countProjectedItems(model, selectedViewIds()),
  );

  const sharedItemCount = createMemo(
    () => [...occurrenceCounts().values()].filter((count) => count > 1).length,
  );

  function toggleView(viewId: number) {
    setSelectedViewIds((current) => {
      if (current.includes(viewId)) {
        return current.length === 1
          ? current
          : current.filter((id) => id !== viewId);
      }
      return current.length < 2 ? [...current, viewId] : current;
    });
  }

  return (
    <main class="page-shell">
      <section class="intro demo-intro">
        <p class="eyebrow">Architecture experiment</p>
        <h1>One reactive item, every View in sync.</h1>
        <p>
          Existing Serial oRPC procedures feed one normalized Solid graph. Each
          View stores IDs; each item is a single fine-grained store read by
          every projection that contains it.
        </p>
      </section>

      <section
        class="architecture-strip"
        aria-label="Proof of concept boundaries"
      >
        <div>
          <strong>Transport</strong>
          <span>existing oRPC</span>
        </div>
        <span aria-hidden="true">→</span>
        <div>
          <strong>State</strong>
          <span>Solid 2 graph</span>
        </div>
        <span aria-hidden="true">→</span>
        <div>
          <strong>Derived UI</strong>
          <span>View signals</span>
        </div>
        <p>No Query cache, React store, server functions, or persistence.</p>
      </section>

      <section class="controls" aria-label="Signal graph controls">
        <div class="control-group">
          <span class="control-label">Compare up to two Views</span>
          <div class="view-choices">
            <For
              each={model.graph.viewOrder}
              fallback={<span class="muted">Loading authenticated Views…</span>}
            >
              {(viewId) => {
                const selected = () => selectedViewIds().includes(viewId);
                return (
                  <button
                    type="button"
                    class={`choice-button${selected() ? ' selected' : ''}`}
                    aria-pressed={selected() ? 'true' : 'false'}
                    disabled={!selected() && selectedViewIds().length >= 2}
                    onClick={() => toggleView(viewId)}
                  >
                    {model.graph.viewsById[viewId]?.name}
                  </button>
                );
              }}
            </For>
          </div>
        </div>

        <div class="status-controls">
          <label>
            <span class="control-label">Collection</span>
            <select
              value={contentStatus().saveStatus}
              onChange={(event) =>
                setContentStatus((current) => ({
                  ...current,
                  saveStatus: event.currentTarget.value as 'inbox' | 'saved',
                }))
              }
            >
              <option value="inbox">Inbox</option>
              <option value="saved">Saved</option>
            </select>
          </label>
          <label>
            <span class="control-label">Reading status</span>
            <select
              value={contentStatus().archiveStatus}
              onChange={(event) =>
                setContentStatus((current) => ({
                  ...current,
                  archiveStatus: event.currentTarget.value as
                    'unread' | 'archived',
                }))
              }
            >
              <option value="unread">Unread</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <button
            class="refresh-button"
            type="button"
            aria-busy={
              isPending(() => model.graph.viewOrder) ? 'true' : 'false'
            }
            onClick={() => model.revalidate()}
          >
            {isPending(() => model.graph.viewOrder) ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </section>

      <section class="signal-readout" aria-live="polite">
        <span>
          <strong>{Object.keys(model.graph.itemsById).length}</strong>{' '}
          normalized items
        </span>
        <span>
          <strong>{selectedViewIds().length}</strong> active View signals
        </span>
        <span>
          <strong>{sharedItemCount()}</strong> items shared across projections
        </span>
      </section>

      <div class="view-grid">
        <For each={selectedViewIds()}>
          {(viewId) => (
            <ViewPanel
              viewId={viewId}
              model={model}
              occurrenceCount={(itemId) => occurrenceCounts().get(itemId) ?? 0}
            />
          )}
        </For>
      </div>
    </main>
  );
}

function IndexRoute() {
  return (
    <Errored
      fallback={(error, reset) => (
        <main class="page-shell">
          <section class="error-panel" role="alert">
            <p class="eyebrow">Could not load Serial data</p>
            <h1>The signal graph needs an authenticated backend.</h1>
            <p>{errorMessage(error())}</p>
            <p>
              Run the main Serial app on the configured backend URL, sign in on
              the same host, then retry.
            </p>
            <button type="button" class="refresh-button" onClick={reset}>
              Retry
            </button>
          </section>
        </main>
      )}
    >
      <SignalGraphDemo />
    </Errored>
  );
}

export const Route = createFileRoute('/')({
  head: () => ({ meta: [{ title: 'Signal graph · Serial Solid 2 PoC' }] }),
  component: IndexRoute,
});
