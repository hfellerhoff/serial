import { createStore, useStore } from "zustand";
import { useMemo } from "react";
import { persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import { orpcRouterClient } from "../orpc";
import { createSelectorHooks } from "./createSelectorHooks";
import {
  applyFeedItemPageRetention,
  getPersistedFeedItemRetentionState,
} from "./feed-page-retention";
import { mergeFeedItem } from "./feed-items/mergeFeedItem";
import { hasFeedItemListProjectionChanged } from "./feed-items/listProjection";
import { clearPendingFeedItemOverrides } from "./feed-items/pendingMutations";
import { feedsStore } from "./feeds/store";
import { createNormalizedIDBStorage } from "./normalized-idb-storage";
import { loadingActor, updateRefreshCooldown } from "./loading-machine";
import {
  reconcileScopeMembershipsForItem,
  reconcileScopeMembershipsForItems,
} from "./scopeMembership";
import { refreshNavigationSnapshotSafely } from "./navigation/store";
import {
  hasRetainedFeedBody,
  isEligibleFeedBody,
  retainEligibleFeedBody,
} from "./offline-content";
import type {
  RetainedFeedPage,
  RetainFeedItemPageInput,
} from "./feed-page-retention";
import type { FetchFeedsStatus } from "~/server/rss/fetchFeeds";
import type { ApplicationFeedItem } from "~/server/db/schema";
import type { FeedItemFulltext } from "~/server/api/routers/initialRouter";
import type { PublishedChunk } from "~/server/api/publisher";
import type { IncomingFeedItem } from "./feed-items/mergeFeedItem";

export { getFeedItemScopeKey } from "./scopeMembership";
export type { FeedItemScopeType } from "./scopeMembership";

// Module-level debounce timer for fulltext fetches
let fulltextTimeout: ReturnType<typeof setTimeout> | null = null;

function mergeFeedItemIntoOrder(
  feedItemsDict: Record<string, ApplicationFeedItem>,
  feedItemsOrder: string[],
  existingIds: Set<string>,
  incomingItem: IncomingFeedItem,
  retainedFeedItemBodyIds: Record<string, true>,
) {
  const mergedItem = mergeFeedItem(
    feedItemsDict[incomingItem.id],
    incomingItem,
  );
  feedItemsDict[incomingItem.id] = mergedItem;
  if (!isEligibleFeedBody(mergedItem)) {
    delete retainedFeedItemBodyIds[incomingItem.id];
  }

  if (!existingIds.has(incomingItem.id)) {
    feedItemsOrder.push(incomingItem.id);
    existingIds.add(incomingItem.id);
  }
}

function getMergedFeedItems(
  feedItemsDict: Record<string, ApplicationFeedItem>,
  incomingItems: ReadonlyArray<Pick<ApplicationFeedItem, "id">>,
) {
  return incomingItems.flatMap((item) => {
    const mergedItem = feedItemsDict[item.id];
    return mergedItem ? [mergedItem] : [];
  });
}

export type ApplicationStore = {
  reset: () => void;
  feedItemsOrder: string[];
  setFeedItemsOrder: (itemsOrder: string[]) => void;
  feedItemsDict: Record<string, ApplicationFeedItem>;
  feedItemProjectionRevision: number;
  scopeFeedItemIds: Record<string, string[]>;
  retainedFeedPages: Record<string, RetainedFeedPage[]>;
  retainedFeedPageBytes: number;
  pageOwnedFeedItemIds: Record<string, true>;
  retainedFeedItemBodyIds: Record<string, true>;
  retainFeedItemPage: (input: RetainFeedItemPageInput) => void;
  feedStatusDict: Record<number, FetchFeedsStatus>;
  setFeedItemsDict: (itemsDict: Record<string, ApplicationFeedItem>) => void;
  setFeedItem: (id: string, item: ApplicationFeedItem) => void;
  setFeedItems: (
    items: ApplicationFeedItem[],
    retention?: RetainFeedItemPageInput,
    retainedBodyItemIds?: ReadonlySet<string>,
  ) => void;
  fetchFeedItemsForFeed: (feedId: number) => Promise<void>;
  fetchNewData: () => Promise<void>;
  hasInitialData: boolean;
  viewFeedIds: Record<number, number[]>;
  // Process chunks received from the publisher subscription
  processChunk: (payload: PublishedChunk) => void;
  // Process multiple chunks in a single batch (used by RAF buffering)
  processChunks: (payloads: PublishedChunk[]) => void;
  // Item IDs that need fulltext content fetched after receiving lightweight items
  pendingFulltextItems: string[];
  // Whether a fulltext request is currently in flight
  isFetchingFulltext: boolean;
  applyFulltextItems: (items: FeedItemFulltext[]) => void;
  // Schedule a debounced fulltext fetch for pending items
  scheduleFulltextFetch: () => void;
};

function getPersistedApplicationState(state: ApplicationStore) {
  const retainedState = getPersistedFeedItemRetentionState(state);
  return {
    ...retainedState,
    viewFeedIds: state.viewFeedIds,
    hasInitialData: state.hasInitialData,
  };
}

const vanillaApplicationStore = createStore<ApplicationStore>()(
  persist(
    (set, get) => ({
      reset: () => {
        clearPendingFeedItemOverrides();
        set({
          feedItemsOrder: [],
          feedItemsDict: {},
          feedItemProjectionRevision: get().feedItemProjectionRevision + 1,
          scopeFeedItemIds: {},
          retainedFeedPages: {},
          retainedFeedPageBytes: 0,
          pageOwnedFeedItemIds: {},
          retainedFeedItemBodyIds: {},
          feedStatusDict: {},
          hasInitialData: false,
          viewFeedIds: {},
          pendingFulltextItems: [],
          isFetchingFulltext: false,
        });
        loadingActor.send({ type: "RESET" });
      },
      feedItemsOrder: [],
      setFeedItemsOrder: (itemsOrder) => set({ feedItemsOrder: itemsOrder }),
      feedItemsDict: {},
      feedItemProjectionRevision: 0,
      scopeFeedItemIds: {},
      retainedFeedPages: {},
      retainedFeedPageBytes: 0,
      pageOwnedFeedItemIds: {},
      retainedFeedItemBodyIds: {},
      retainFeedItemPage: (input) =>
        set(applyFeedItemPageRetention(get(), input)),
      feedStatusDict: {},
      setFeedItemsDict: (itemsDict) =>
        set({
          feedItemsDict: itemsDict,
          feedItemProjectionRevision: get().feedItemProjectionRevision + 1,
        }),
      setFeedItem: (id, item) => {
        const state = get();
        const previousItem = state.feedItemsDict[id];
        const retainedItem = retainEligibleFeedBody(previousItem, item);
        const retainedFeedItemBodyIds = {
          ...state.retainedFeedItemBodyIds,
        };
        if (!isEligibleFeedBody(retainedItem)) {
          delete retainedFeedItemBodyIds[id];
        }
        const projectionChanged = hasFeedItemListProjectionChanged(
          previousItem,
          retainedItem,
        );

        // Feed-item entities are normalized by id. Replacing just this entry
        // keeps progress and full-text patches O(1), while Zustand's item
        // selector still observes the new entity object.
        state.feedItemsDict[id] = retainedItem;

        set({
          feedItemsDict: state.feedItemsDict,
          feedItemProjectionRevision: projectionChanged
            ? state.feedItemProjectionRevision + 1
            : state.feedItemProjectionRevision,
          scopeFeedItemIds: projectionChanged
            ? reconcileScopeMembershipsForItem(
                state.scopeFeedItemIds,
                retainedItem,
              )
            : state.scopeFeedItemIds,
          retainedFeedItemBodyIds,
        });
      },
      setFeedItems: (items, retention, retainedBodyItemIds) => {
        if (items.length === 0) return;

        const state = get();
        const feedItemsDict = state.feedItemsDict;
        const projectionChangedItems: ApplicationFeedItem[] = [];
        const retainedFeedItemBodyIds = {
          ...state.retainedFeedItemBodyIds,
        };

        for (const item of items) {
          const retainedItem = retainEligibleFeedBody(
            state.feedItemsDict[item.id],
            item,
          );
          if (
            hasFeedItemListProjectionChanged(
              state.feedItemsDict[item.id],
              retainedItem,
            )
          ) {
            projectionChangedItems.push(retainedItem);
          }
          // Feed-item entities are normalized by id. Mutating only changed
          // entries keeps batch cost proportional to the incoming page or
          // optimistic selection instead of cloning the whole library.
          feedItemsDict[item.id] = retainedItem;
          if (
            retainedBodyItemIds?.has(item.id) &&
            isEligibleFeedBody(retainedItem)
          ) {
            retainedFeedItemBodyIds[item.id] = true;
          } else if (!isEligibleFeedBody(retainedItem)) {
            delete retainedFeedItemBodyIds[item.id];
          }
        }

        const scopeFeedItemIds =
          projectionChangedItems.length > 0
            ? reconcileScopeMembershipsForItems(
                state.scopeFeedItemIds,
                projectionChangedItems,
              )
            : state.scopeFeedItemIds;
        const projectionState = {
          ...state,
          feedItemsDict,
          feedItemProjectionRevision:
            projectionChangedItems.length > 0
              ? state.feedItemProjectionRevision + 1
              : state.feedItemProjectionRevision,
          scopeFeedItemIds,
          retainedFeedItemBodyIds,
        };
        set(
          retention
            ? {
                ...projectionState,
                ...applyFeedItemPageRetention(projectionState, retention),
              }
            : projectionState,
        );
      },
      hasInitialData: false,
      viewFeedIds: {},
      pendingFulltextItems: [],
      isFetchingFulltext: false,

      applyFulltextItems: (items) => {
        const feedItemsDict = get().feedItemsDict;
        const pendingFulltext = new Set(get().pendingFulltextItems);
        const retainedFeedItemBodyIds = {
          ...get().retainedFeedItemBodyIds,
        };

        for (const item of items) {
          const existing = feedItemsDict[item.id];
          if (
            existing &&
            existing.contentType === "text" &&
            !existing.isWatched
          ) {
            feedItemsDict[item.id] = {
              ...existing,
              content: item.content,
              contentSnippet: item.contentSnippet,
            };
            if (item.content.trim()) {
              retainedFeedItemBodyIds[item.id] = true;
            }
          }
          pendingFulltext.delete(item.id);
        }

        set({
          feedItemsDict,
          pendingFulltextItems: Array.from(pendingFulltext),
          retainedFeedItemBodyIds,
        });
      },

      scheduleFulltextFetch: () => {
        // Debounce fulltext requests so multiple lightweight chunks
        // arriving in quick succession are batched into one request.
        const DEBOUNCE_MS = 300;
        if (fulltextTimeout) {
          clearTimeout(fulltextTimeout);
        }

        fulltextTimeout = setTimeout(() => {
          fulltextTimeout = null;
          const state = get();
          if (
            state.isFetchingFulltext ||
            state.pendingFulltextItems.length === 0
          ) {
            return;
          }

          set({ isFetchingFulltext: true });

          const FULLTEXT_BATCH_SIZE = 500;
          const itemIds = state.pendingFulltextItems.slice(
            0,
            FULLTEXT_BATCH_SIZE,
          );
          const remaining =
            state.pendingFulltextItems.slice(FULLTEXT_BATCH_SIZE);
          set({ pendingFulltextItems: remaining });

          void orpcRouterClient.initial
            .requestFullTextForItems({
              itemIds,
            })
            .then((items) => {
              get().applyFulltextItems(items);
            })
            .catch((error) => {
              console.error("Error fetching fulltext:", error);
            })
            .finally(() => {
              set({ isFetchingFulltext: false });
              // If new pending items accumulated while this request was in flight,
              // schedule another fetch.
              if (get().pendingFulltextItems.length > 0) {
                get().scheduleFulltextFetch();
              }
            });
        }, DEBOUNCE_MS);
      },

      fetchFeedItemsForFeed: async (feedId: number) => {
        for await (const incomingChunk of await orpcRouterClient.feedItem.getByFeedId(
          { feedId },
        )) {
          const feedStatusDict = { ...get().feedStatusDict };
          const feedItemsDict = { ...get().feedItemsDict };
          const feedItemsOrder = [...get().feedItemsOrder];
          const retainedFeedItemBodyIds = {
            ...get().retainedFeedItemBodyIds,
          };
          let incomingFeedItems: ApplicationFeedItem[] = [];

          if (incomingChunk.type === "feed-status") {
            feedStatusDict[incomingChunk.feedId] = incomingChunk.status;
          } else {
            incomingFeedItems = incomingChunk.feedItems;
            const existingIds = new Set(feedItemsOrder);

            incomingFeedItems.forEach((item) => {
              mergeFeedItemIntoOrder(
                feedItemsDict,
                feedItemsOrder,
                existingIds,
                item,
                retainedFeedItemBodyIds,
              );
            });
          }

          set({
            feedItemsDict: feedItemsDict,
            feedItemsOrder,
            feedStatusDict: feedStatusDict,
            retainedFeedItemBodyIds,
            scopeFeedItemIds:
              incomingFeedItems.length > 0
                ? reconcileScopeMembershipsForItems(
                    get().scopeFeedItemIds,
                    getMergedFeedItems(feedItemsDict, incomingFeedItems),
                  )
                : get().scopeFeedItemIds,
          });
        }

        set({
          feedItemsOrder: [...get().feedItemsOrder],
        });
        await refreshNavigationSnapshotSafely();
      },

      fetchNewData: async () => {
        // Show loading state immediately so the refresh button responds
        set({ feedStatusDict: {} });
        loadingActor.send({ type: "MANUAL_REFRESH_REQUEST" });

        try {
          const { dataReconciliation } = await import("./reconciliation");
          await dataReconciliation.requestManualFull();
          const result = await dataReconciliation.requestDueSources("manual");
          if (result.status === "cooldown") {
            loadingActor.send({ type: "RESET" });
          }
        } catch (e) {
          // Exit loading state so the button re-enables on error
          loadingActor.send({ type: "RESET" });
          throw e;
        }
      },

      processChunk: (payload: PublishedChunk) => {
        const { source, chunk } = payload;

        // Helper function to merge feed items into the store
        const mergeFeedItems = (items: ApplicationFeedItem[]) => {
          const feedItemsDict = { ...get().feedItemsDict };
          const feedItemsOrder = [...get().feedItemsOrder];
          const retainedFeedItemBodyIds = {
            ...get().retainedFeedItemBodyIds,
          };
          const existingIds = new Set(feedItemsOrder);

          items.forEach((item) => {
            mergeFeedItemIntoOrder(
              feedItemsDict,
              feedItemsOrder,
              existingIds,
              item,
              retainedFeedItemBodyIds,
            );
          });

          set({
            feedItemsDict,
            feedItemsOrder,
            retainedFeedItemBodyIds,
            scopeFeedItemIds: reconcileScopeMembershipsForItems(
              get().scopeFeedItemIds,
              getMergedFeedItems(feedItemsDict, items),
            ),
          });
        };

        switch (source) {
          case "rss": {
            switch (chunk.type) {
              case "refresh-start":
                set({ feedStatusDict: {} });
                updateRefreshCooldown(new Date(chunk.nextRefreshAt));
                loadingActor.send({
                  type: "BACKGROUND_REFRESH_START",
                  totalFeeds: chunk.totalFeeds,
                });
                break;
              case "feed-status": {
                set({
                  feedStatusDict: {
                    ...get().feedStatusDict,
                    [chunk.feedId]: chunk.status,
                  },
                });
                loadingActor.send({ type: "FEED_STATUS" });
                break;
              }
              case "feed-items":
                mergeFeedItems(chunk.feedItems);
                break;
              case "rss-attempt-complete":
                loadingActor.send({ type: "BACKGROUND_REFRESH_COMPLETE" });
                break;
            }
            break;
          }
        }
      },

      processChunks: (payloads: PublishedChunk[]) => {
        for (const payload of payloads) get().processChunk(payload);
      },
    }),
    {
      name: "serial-application-store",
      storage: createNormalizedIDBStorage({
        recordFields: ["feedItemsDict", "retainedFeedItemBodyIds"],
        arrayFields: ["feedItemsOrder"],
      }),
      version: 1,
      partialize: getPersistedApplicationState,
      merge: (persisted, current) => {
        const persistedState =
          (persisted as Partial<ApplicationStore> | undefined) ?? {};
        const merged = {
          ...current,
          ...persistedState,
          scopeFeedItemIds: persistedState.scopeFeedItemIds ?? {},
          retainedFeedPages: persistedState.retainedFeedPages ?? {},
          retainedFeedPageBytes: persistedState.retainedFeedPageBytes ?? 0,
          pageOwnedFeedItemIds: persistedState.pageOwnedFeedItemIds ?? {},
          retainedFeedItemBodyIds: persistedState.retainedFeedItemBodyIds ?? {},
        };

        // Cross-reference hydrated feed items against the feeds store's
        // cached feed list. If a feed was deleted on another client and that
        // client's cleanup was persisted to IDB (via pagehide flush), the
        // feeds store will no longer contain the deleted feed — but the
        // application store may still have its items. Filtering here
        // prevents a flash of deleted items on first load.
        //
        // We gate on fetchStatus === "success" (set by the feeds store's own
        // merge function) rather than just feeds.length > 0 — this ensures the
        // feeds store has actually hydrated from IDB, not just initialized with
        // its default empty array. If the feeds store hasn't hydrated yet, we
        // skip filtering entirely and let the server correction handle it.
        const feedsState = feedsStore.getState();
        const feedsHydrated = feedsState.fetchStatus === "success";
        if (feedsHydrated && merged.feedItemsDict) {
          const cachedFeeds = feedsState.feeds;
          const validFeedIds = new Set(cachedFeeds.map((f) => f.id));
          const dict = merged.feedItemsDict;
          const order = merged.feedItemsOrder ?? [];

          const orphanedIds: string[] = [];
          for (const id of order) {
            const item = dict[id];
            if (item && !validFeedIds.has(item.feedId)) {
              orphanedIds.push(id);
            }
          }

          if (orphanedIds.length > 0) {
            const orphanedSet = new Set(orphanedIds);
            const newDict = { ...dict };
            for (const id of orphanedIds) {
              delete newDict[id];
            }
            merged.feedItemsDict = newDict;
            merged.feedItemsOrder = order.filter((id) => !orphanedSet.has(id));
            merged.retainedFeedItemBodyIds = Object.fromEntries(
              Object.entries(merged.retainedFeedItemBodyIds).filter(
                ([id]) => !orphanedSet.has(id),
              ),
            );
          }
        }

        return merged;
      },
    },
  ),
);

export const feedItemsStore = createSelectorHooks(vanillaApplicationStore);

export function retainLoadedFeedItemBody(itemId: string) {
  const state = feedItemsStore.getState();
  const item = state.feedItemsDict[itemId];
  if (!item || !isEligibleFeedBody(item)) return false;
  feedItemsStore.setState({
    retainedFeedItemBodyIds: {
      ...state.retainedFeedItemBodyIds,
      [itemId]: true,
    },
  });
  return true;
}

export async function retainFeedItemBody(itemId: string) {
  const state = feedItemsStore.getState();
  const item = state.feedItemsDict[itemId];
  if (
    !item ||
    item.contentType !== "text" ||
    item.isWatched ||
    hasRetainedFeedBody(item, state.retainedFeedItemBodyIds[itemId] === true) ||
    (typeof navigator !== "undefined" && navigator.onLine === false)
  ) {
    return;
  }
  if (retainLoadedFeedItemBody(itemId)) return;
  const items = await orpcRouterClient.initial.requestFullTextForItems({
    itemIds: [itemId],
  });
  feedItemsStore.getState().applyFulltextItems(items);
}

export const useFeedItemsListProjection = () => {
  const revision = useStore(
    feedItemsStore,
    (store) => store.feedItemProjectionRevision,
  );

  return useMemo(
    () => ({
      revision,
      getItems: () => feedItemsStore.getState().feedItemsDict,
    }),
    [revision],
  );
};

export const {
  useFeedItemsOrder,
  useScopeFeedItemIds,
  useFeedStatusDict,
  useHasInitialData,
  useFetchFeedItemsForFeed,
  useFetchNewData,
  useViewFeedIds,
} = feedItemsStore;

export const useFeedItemValue = (id: string) => {
  return useStore(
    feedItemsStore,
    useShallow((store) => store.feedItemsDict[id]),
  );
};
export const useHasRetainedFeedItemBody = (id: string) => {
  return useStore(
    feedItemsStore,
    (store) => store.retainedFeedItemBodyIds[id] === true,
  );
};
export const useSetFeedItemValue = (id: string) => {
  const setter = useStore(feedItemsStore, (store) => store.setFeedItem);

  return (item: ApplicationFeedItem) => setter(id, item);
};

export const useFeedItemState = (id: string) => {
  const value = useFeedItemValue(id);
  const setValue = useSetFeedItemValue(id);

  return [value, setValue] as const;
};
