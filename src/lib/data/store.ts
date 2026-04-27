import { createStore, useStore } from "zustand";
import { persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import { orpcRouterClient } from "../orpc";
import { sortFeedItemsOrderByDate } from "../sortFeedItems";
import { applyDiffEntries } from "./applyDiffEntries";
import { buildViewManifests } from "./buildViewManifests";
import { contentCategoriesStore } from "./content-categories/store";
import { createSelectorHooks } from "./createSelectorHooks";
import { feedCategoriesStore } from "./feed-categories/store";
import { feedsStore } from "./feeds/store";
import { createIDBStorage } from "./idb-storage";
import { loadingActor } from "./loading-machine";
import { viewFeedsStore } from "./view-feeds/store";
import { viewsStore } from "./views/store";
import type { VisibilityFilter } from "./atoms";
import type { FetchFeedsStatus } from "~/server/rss/fetchFeeds";
import type { ApplicationFeedItem } from "~/server/db/schema";
import type {
  DiffEntry,
  GetItemsByVisibilityChunk,
  PaginationCursor,
} from "~/server/api/routers/initialRouter";
import type { PublishedChunk } from "~/server/api/publisher";
import { getQueryClient } from "~/lib/query-provider";
import { orpc } from "~/lib/orpc";

export type PaginationState = {
  cursor: PaginationCursor;
  hasMore: boolean;
  isFetching: boolean;
};

export type ApplicationStore = {
  reset: () => void;
  feedItemsOrder: string[];
  setFeedItemsOrder: (itemsOrder: string[]) => void;
  feedItemsDict: Record<string, ApplicationFeedItem>;
  feedStatusDict: Record<number, FetchFeedsStatus>;
  setFeedItemsDict: (itemsDict: Record<string, ApplicationFeedItem>) => void;
  setFeedItem: (id: string, item: ApplicationFeedItem) => void;
  fetchFeedItems: () => Promise<void>;
  fetchFeedItemsForFeed: (feedId: number) => Promise<void>;
  fetchNewData: () => Promise<void>;
  revalidateView: (viewId: number) => Promise<void>;
  fetchFeedItemsLastFetchedAt: number | null;
  hasInitialData: boolean;
  currentViewId: number | null;
  viewFeedIds: Record<number, number[]>;
  setViewFeedIds: (viewId: number, feedIds: number[]) => void;
  // Pagination state per view and visibility filter
  viewPaginationState: Record<
    number,
    Partial<Record<VisibilityFilter, PaginationState>>
  >;
  // Track which visibility filters have been fetched for each view
  fetchedVisibilityFilters: Record<number, Set<VisibilityFilter>>;
  // Fetch items for a specific visibility filter (lazy loading)
  fetchItemsForVisibility: (
    viewId: number,
    visibilityFilter: VisibilityFilter,
  ) => Promise<void>;
  // Fetch more items with cursor (pagination)
  fetchMoreItems: (
    viewId: number,
    visibilityFilter: VisibilityFilter,
  ) => Promise<void>;
  // Get pagination state for a view and visibility filter
  getPaginationState: (
    viewId: number,
    visibilityFilter: VisibilityFilter,
  ) => PaginationState | undefined;
  // Feed-specific pagination state
  feedPaginationState: Record<
    number,
    Partial<Record<VisibilityFilter, PaginationState>>
  >;
  // Category-specific pagination state
  categoryPaginationState: Record<
    number,
    Partial<Record<VisibilityFilter, PaginationState>>
  >;
  // Track which visibility filters have been fetched for each feed
  fetchedFeedFilters: Record<number, Set<VisibilityFilter>>;
  // Track which visibility filters have been fetched for each category
  fetchedCategoryFilters: Record<number, Set<VisibilityFilter>>;
  // Fetch more items for a feed (pagination)
  fetchMoreItemsForFeed: (
    feedId: number,
    visibilityFilter: VisibilityFilter,
  ) => Promise<void>;
  // Fetch more items for a category (pagination)
  fetchMoreItemsForCategory: (
    categoryId: number,
    visibilityFilter: VisibilityFilter,
  ) => Promise<void>;
  // Process chunks received from the publisher subscription
  processChunk: (payload: PublishedChunk) => void;
  // Process multiple chunks in a single batch (used by RAF buffering)
  processChunks: (payloads: PublishedChunk[]) => void;
  // Internal: Track oldest item per view during initial data processing for cursor computation
  _lastItemByView: Record<number, ApplicationFeedItem | null>;
  // Internal: Track pagination cursors from view-diff chunks per view per visibility
  _pendingViewCursors: Record<
    number,
    Partial<Record<VisibilityFilter, PaginationCursor>>
  >;
};

const vanillaApplicationStore = createStore<ApplicationStore>()(
  persist(
    (set, get) => ({
      reset: () => {
        set({
          feedItemsOrder: [],
          feedItemsDict: {},
          feedStatusDict: {},
          fetchFeedItemsLastFetchedAt: null,
          hasInitialData: false,
          currentViewId: null,
          viewFeedIds: {},
          viewPaginationState: {},
          fetchedVisibilityFilters: {},
          feedPaginationState: {},
          categoryPaginationState: {},
          fetchedFeedFilters: {},
          fetchedCategoryFilters: {},
          _lastItemByView: {},
          _pendingViewCursors: {},
        });
        loadingActor.send({ type: "RESET" });
      },
      feedItemsOrder: [],
      setFeedItemsOrder: (itemsOrder) => set({ feedItemsOrder: itemsOrder }),
      feedItemsDict: {},
      feedStatusDict: {},
      setFeedItemsDict: (itemsDict) => set({ feedItemsDict: itemsDict }),
      setFeedItem: (id, item) =>
        set({
          feedItemsDict: {
            ...get().feedItemsDict,
            [id]: item,
          },
        }),
      fetchFeedItemsLastFetchedAt: null,
      hasInitialData: false,
      currentViewId: null,
      viewFeedIds: {},
      setViewFeedIds: (viewId, feedIds) =>
        set({
          viewFeedIds: {
            ...get().viewFeedIds,
            [viewId]: feedIds,
          },
        }),
      viewPaginationState: {},
      fetchedVisibilityFilters: {},
      feedPaginationState: {},
      categoryPaginationState: {},
      fetchedFeedFilters: {},
      fetchedCategoryFilters: {},
      _lastItemByView: {},
      _pendingViewCursors: {},

      getPaginationState: (viewId, visibilityFilter) => {
        return get().viewPaginationState[viewId]?.[visibilityFilter];
      },

      fetchItemsForVisibility: async (viewId, visibilityFilter) => {
        const state = get();

        // Check if already fetched for this view/filter
        const fetchedFilters = state.fetchedVisibilityFilters[viewId];
        if (fetchedFilters?.has(visibilityFilter)) {
          return;
        }

        // Check if already fetching
        const paginationState =
          state.viewPaginationState[viewId]?.[visibilityFilter];
        if (paginationState?.isFetching) {
          return;
        }

        // Set fetching state
        set({
          viewPaginationState: {
            ...state.viewPaginationState,
            [viewId]: {
              ...state.viewPaginationState[viewId],
              [visibilityFilter]: {
                cursor: null,
                hasMore: true,
                isFetching: true,
              },
            },
          },
        });

        try {
          for await (const chunk of (await orpcRouterClient.initial.getItemsByVisibility(
            {
              viewId,
              visibilityFilter,
            },
          )) as AsyncIterable<GetItemsByVisibilityChunk>) {
            if (chunk.type === "error") {
              console.error("Error fetching items:", chunk.message);
              continue;
            }

            if (chunk.type !== "feed-items") continue;

            const feedItemsDict = { ...get().feedItemsDict };
            const feedItemsOrder = [...get().feedItemsOrder];
            const existingIds = new Set(feedItemsOrder);

            chunk.feedItems.forEach((item) => {
              feedItemsDict[item.id] = item;
              if (!existingIds.has(item.id)) {
                feedItemsOrder.push(item.id);
                existingIds.add(item.id);
              }
            });

            set({
              feedItemsDict,
              feedItemsOrder: feedItemsOrder.sort(
                sortFeedItemsOrderByDate(get().feedItemsDict),
              ),
              viewPaginationState: {
                ...get().viewPaginationState,
                [viewId]: {
                  ...get().viewPaginationState[viewId],
                  [visibilityFilter]: {
                    cursor: chunk.nextCursor,
                    hasMore: chunk.hasMore,
                    isFetching: false,
                  },
                },
              },
            });
          }

          // Mark visibility filter as fetched
          set({
            fetchedVisibilityFilters: {
              ...get().fetchedVisibilityFilters,
              [viewId]: new Set([
                ...(get().fetchedVisibilityFilters[viewId] ?? []),
                visibilityFilter,
              ]),
            },
          });
        } catch (error) {
          console.error("Error fetching items for visibility:", error);
          // Reset fetching state on error
          set({
            viewPaginationState: {
              ...get().viewPaginationState,
              [viewId]: {
                ...get().viewPaginationState[viewId],
                [visibilityFilter]: {
                  cursor: null,
                  hasMore: false,
                  isFetching: false,
                },
              },
            },
          });
        }
      },

      fetchMoreItems: async (viewId, visibilityFilter) => {
        const state = get();
        const paginationState =
          state.viewPaginationState[viewId]?.[visibilityFilter];

        // Don't fetch if no more items or already fetching
        if (!paginationState?.hasMore || paginationState.isFetching) {
          return;
        }

        // Set fetching state
        set({
          viewPaginationState: {
            ...state.viewPaginationState,
            [viewId]: {
              ...state.viewPaginationState[viewId],
              [visibilityFilter]: {
                ...paginationState,
                isFetching: true,
              },
            },
          },
        });

        try {
          for await (const chunk of (await orpcRouterClient.initial.getItemsByVisibility(
            {
              viewId,
              visibilityFilter,
              cursor: paginationState.cursor,
            },
          )) as AsyncIterable<GetItemsByVisibilityChunk>) {
            if (chunk.type === "error") {
              console.error("Error fetching more items:", chunk.message);
              continue;
            }

            if (chunk.type !== "feed-items") continue;

            const feedItemsDict = { ...get().feedItemsDict };
            const feedItemsOrder = [...get().feedItemsOrder];
            const existingIds = new Set(feedItemsOrder);

            chunk.feedItems.forEach((item) => {
              feedItemsDict[item.id] = item;
              if (!existingIds.has(item.id)) {
                feedItemsOrder.push(item.id);
                existingIds.add(item.id);
              }
            });

            set({
              feedItemsDict,
              feedItemsOrder: feedItemsOrder.sort(
                sortFeedItemsOrderByDate(get().feedItemsDict),
              ),
              viewPaginationState: {
                ...get().viewPaginationState,
                [viewId]: {
                  ...get().viewPaginationState[viewId],
                  [visibilityFilter]: {
                    cursor: chunk.nextCursor,
                    hasMore: chunk.hasMore,
                    isFetching: false,
                  },
                },
              },
            });
          }
        } catch (error) {
          console.error("Error fetching more items:", error);
          // Reset fetching state on error but keep cursor
          set({
            viewPaginationState: {
              ...get().viewPaginationState,
              [viewId]: {
                ...get().viewPaginationState[viewId],
                [visibilityFilter]: {
                  ...get().viewPaginationState[viewId]?.[visibilityFilter],
                  isFetching: false,
                } as PaginationState,
              },
            },
          });
        }
      },

      fetchMoreItemsForFeed: async (feedId, visibilityFilter) => {
        const state = get();
        const paginationState =
          state.feedPaginationState[feedId]?.[visibilityFilter];

        // Don't fetch if no more items or already fetching
        if (!paginationState?.hasMore || paginationState.isFetching) {
          return;
        }

        // Set fetching state
        set({
          feedPaginationState: {
            ...state.feedPaginationState,
            [feedId]: {
              ...state.feedPaginationState[feedId],
              [visibilityFilter]: {
                ...paginationState,
                isFetching: true,
              },
            },
          },
        });

        // Use publisher pattern - chunks will be processed via processChunk
        try {
          await orpcRouterClient.initial.requestItemsByFeed({
            feedId,
            visibilityFilter,
            cursor: paginationState.cursor,
          });
        } catch (error) {
          console.error("Error requesting more items for feed:", error);
          set({
            feedPaginationState: {
              ...get().feedPaginationState,
              [feedId]: {
                ...get().feedPaginationState[feedId],
                [visibilityFilter]: {
                  ...get().feedPaginationState[feedId]?.[visibilityFilter],
                  isFetching: false,
                } as PaginationState,
              },
            },
          });
        }
      },

      fetchMoreItemsForCategory: async (categoryId, visibilityFilter) => {
        const state = get();
        const paginationState =
          state.categoryPaginationState[categoryId]?.[visibilityFilter];

        // Don't fetch if no more items or already fetching
        if (!paginationState?.hasMore || paginationState.isFetching) {
          return;
        }

        // Set fetching state
        set({
          categoryPaginationState: {
            ...state.categoryPaginationState,
            [categoryId]: {
              ...state.categoryPaginationState[categoryId],
              [visibilityFilter]: {
                ...paginationState,
                isFetching: true,
              },
            },
          },
        });

        // Use publisher pattern - chunks will be processed via processChunk
        try {
          await orpcRouterClient.initial.requestItemsByCategoryId({
            categoryId,
            visibilityFilter,
            cursor: paginationState.cursor,
          });
        } catch (error) {
          console.error("Error requesting more items for category:", error);
          set({
            categoryPaginationState: {
              ...get().categoryPaginationState,
              [categoryId]: {
                ...get().categoryPaginationState[categoryId],
                [visibilityFilter]: {
                  ...get().categoryPaginationState[categoryId]?.[
                    visibilityFilter
                  ],
                  isFetching: false,
                } as PaginationState,
              },
            },
          });
        }
      },

      fetchFeedItems: async () => {
        if (!loadingActor.getSnapshot().matches("idle")) return;

        console.log("FETCHING");

        set({
          feedStatusDict: {},
        });

        let lastUpdateTime = 0;
        const DEBOUNCE_TIME = 1000;

        for await (const incomingChunk of await orpcRouterClient.feedItem.getAll()) {
          const timeSinceLastUpdate = Date.now() - lastUpdateTime;
          const timeToWait = DEBOUNCE_TIME - timeSinceLastUpdate;
          const shouldWaitToRender = timeToWait > 0;

          const feedStatusDict = shouldWaitToRender
            ? get().feedStatusDict
            : {
                ...get().feedStatusDict,
              };

          const feedItemsDict = shouldWaitToRender
            ? get().feedItemsDict
            : {
                ...get().feedItemsDict,
              };

          const feedItemsOrder = shouldWaitToRender
            ? get().feedItemsOrder
            : [...get().feedItemsOrder];

          if (incomingChunk.type === "feed-status") {
            feedStatusDict[incomingChunk.feedId] = incomingChunk.status;
          } else {
            const incomingFeedItems = incomingChunk.feedItems;
            const existingIds = new Set(feedItemsOrder);

            incomingFeedItems.forEach((item) => {
              feedItemsDict[item.id] = item;

              if (!existingIds.has(item.id)) {
                feedItemsOrder.push(item.id);
                existingIds.add(item.id);
              }
            });
          }

          set({
            feedItemsDict: feedItemsDict,
            feedItemsOrder: feedItemsOrder.sort(
              sortFeedItemsOrderByDate(get().feedItemsDict),
            ),
            feedStatusDict: feedStatusDict,
          });

          if (!shouldWaitToRender) {
            lastUpdateTime = Date.now();
          }
        }

        set({
          fetchFeedItemsLastFetchedAt: Date.now(),
          feedItemsDict: { ...get().feedItemsDict },
          feedItemsOrder: [...get().feedItemsOrder].sort(
            sortFeedItemsOrderByDate(get().feedItemsDict),
          ),
          feedStatusDict: { ...get().feedStatusDict },
        });
      },

      fetchFeedItemsForFeed: async (feedId: number) => {
        for await (const incomingChunk of await orpcRouterClient.feedItem.getByFeedId(
          { feedId },
        )) {
          const feedStatusDict = { ...get().feedStatusDict };
          const feedItemsDict = { ...get().feedItemsDict };
          const feedItemsOrder = [...get().feedItemsOrder];

          if (incomingChunk.type === "feed-status") {
            feedStatusDict[incomingChunk.feedId] = incomingChunk.status;
          } else {
            const incomingFeedItems = incomingChunk.feedItems;
            const existingIds = new Set(feedItemsOrder);

            incomingFeedItems.forEach((item) => {
              feedItemsDict[item.id] = item;

              if (!existingIds.has(item.id)) {
                feedItemsOrder.push(item.id);
                existingIds.add(item.id);
              }
            });
          }

          set({
            feedItemsDict: feedItemsDict,
            feedItemsOrder: feedItemsOrder.sort(
              sortFeedItemsOrderByDate(get().feedItemsDict),
            ),
            feedStatusDict: feedStatusDict,
          });
        }

        set({
          feedItemsOrder: [...get().feedItemsOrder].sort(
            sortFeedItemsOrderByDate(get().feedItemsDict),
          ),
        });
      },

      fetchNewData: async () => {
        // Show loading state immediately so the refresh button responds
        set({ feedStatusDict: {} });
        loadingActor.send({ type: "MANUAL_REFRESH_REQUEST" });

        try {
          // Re-run the same flow as initial mount: metadata, diffs, RSS refresh.
          // Rate limiting is handled server-side via checkUserRefreshEligibility —
          // if the user is in cooldown, metadata+diffs still run but RSS is skipped.
          const viewManifests = buildViewManifests(get());
          await orpcRouterClient.initial.requestInitialData({ viewManifests });
        } catch (e) {
          // Exit loading state so the button re-enables on error
          loadingActor.send({ type: "RESET" });
          throw e;
        }
      },

      revalidateView: async (viewId: number) => {
        for await (const chunk of await orpcRouterClient.initial.revalidateView(
          {
            viewId,
          },
        )) {
          switch (chunk.type) {
            case "views":
              // Update views in views store
              viewsStore.getState().set(chunk.views);
              break;

            case "view-feeds":
              // Store the feed IDs for this view
              get().setViewFeedIds(chunk.viewId, chunk.feedIds);
              break;

            case "feed-items": {
              // Merge into feedItemsDict and feedItemsOrder (no reset)
              const feedItemsDict = { ...get().feedItemsDict };
              const feedItemsOrder = [...get().feedItemsOrder];

              const incomingFeedItems = chunk.feedItems;
              const existingIds = new Set(feedItemsOrder);

              incomingFeedItems.forEach((item) => {
                feedItemsDict[item.id] = item;

                if (!existingIds.has(item.id)) {
                  feedItemsOrder.push(item.id);
                  existingIds.add(item.id);
                }
              });

              set({
                feedItemsDict,
                feedItemsOrder: feedItemsOrder.sort(
                  sortFeedItemsOrderByDate(get().feedItemsDict),
                ),
              });
              break;
            }
          }
        }
      },

      processChunk: (payload: PublishedChunk) => {
        const { source, chunk } = payload;

        // Helper function to merge feed items into the store
        const mergeFeedItems = (items: ApplicationFeedItem[]) => {
          const feedItemsDict = { ...get().feedItemsDict };
          const feedItemsOrder = [...get().feedItemsOrder];
          const existingIds = new Set(feedItemsOrder);

          items.forEach((item) => {
            feedItemsDict[item.id] = item;
            if (!existingIds.has(item.id)) {
              feedItemsOrder.push(item.id);
              existingIds.add(item.id);
            }
          });

          set({
            feedItemsDict,
            feedItemsOrder: feedItemsOrder.sort(
              sortFeedItemsOrderByDate(feedItemsDict),
            ),
          });
        };

        switch (source) {
          case "initial": {
            const initialChunk = chunk;

            switch (initialChunk.type) {
              case "views":
                viewsStore.getState().set(initialChunk.views);
                viewsStore.setState({ fetchStatus: "success" });
                // Show UI immediately when views are received
                // Only reset loading state if this is a true initial load (not a metadata refresh)
                if (!get().hasInitialData) {
                  set({
                    hasInitialData: true,
                    feedStatusDict: {}, // Clear stale entries from previous fetch
                  });
                  loadingActor.send({ type: "INITIAL_LOAD_START" });
                }
                break;

              case "feeds": {
                feedsStore.getState().set(initialChunk.feeds);
                feedsStore.setState({ fetchStatus: "success" });

                // Feed-level deletion: remove cached items whose feed no longer exists.
                // This is the primary deletion path — items are deleted via feed cascade,
                // not individually. Comparing feed IDs catches all such deletions without
                // needing an unbounded global manifest.
                const serverFeedIds = new Set(
                  initialChunk.feeds.map((f) => f.id),
                );
                const currentDict = get().feedItemsDict;
                const currentOrder = get().feedItemsOrder;
                const orphanedIds: string[] = [];

                for (const id of currentOrder) {
                  const item = currentDict[id];
                  if (item && !serverFeedIds.has(item.feedId)) {
                    orphanedIds.push(id);
                  }
                }

                if (orphanedIds.length > 0) {
                  const orphanedSet = new Set(orphanedIds);
                  const newDict: Record<string, ApplicationFeedItem> = {};
                  const newOrder: string[] = [];
                  for (const id of currentOrder) {
                    if (!orphanedSet.has(id) && currentDict[id]) {
                      newOrder.push(id);
                      newDict[id] = currentDict[id];
                    }
                  }
                  set({ feedItemsDict: newDict, feedItemsOrder: newOrder });
                }
                break;
              }

              case "content-categories":
                contentCategoriesStore
                  .getState()
                  .set(initialChunk.contentCategories);
                contentCategoriesStore.setState({ fetchStatus: "success" });
                break;

              case "feed-categories":
                feedCategoriesStore.getState().set(initialChunk.feedCategories);
                feedCategoriesStore.setState({ fetchStatus: "success" });
                break;

              case "view-feeds":
                get().setViewFeedIds(initialChunk.viewId, initialChunk.feedIds);
                break;

              case "refresh-start": {
                // Re-enter fetching state for RSS refresh phase.
                // The loading machine tracks totalFeeds via BACKGROUND_REFRESH_START.
                set({
                  feedStatusDict: {},
                });

                // Round up to the next whole minute so the button re-enables
                // in sync with the background-refresh cron (runs every minute).
                let cooldownMs: number | null = null;
                if (initialChunk.nextRefreshAt) {
                  const raw = new Date(initialChunk.nextRefreshAt).getTime();
                  const MS_PER_MINUTE = 60_000;
                  cooldownMs = Math.ceil(raw / MS_PER_MINUTE) * MS_PER_MINUTE;
                }
                loadingActor.send({
                  type: "REFRESH_COOLDOWN_UPDATE",
                  nextRefreshAt: cooldownMs,
                });

                loadingActor.send({
                  type: "BACKGROUND_REFRESH_START",
                  totalFeeds: initialChunk.totalFeeds,
                });
                break;
              }

              case "refresh-complete":
                loadingActor.send({ type: "BACKGROUND_REFRESH_COMPLETE" });
                break;

              case "feed-status": {
                const feedStatusDict = { ...get().feedStatusDict };
                feedStatusDict[initialChunk.feedId] = initialChunk.status;
                set({ feedStatusDict });
                loadingActor.send({ type: "FEED_STATUS" });
                break;
              }

              case "initial-data-complete": {
                // Fetch view-feed assignments (not part of SSE chunks)
                viewFeedsStore.getState().fetch();

                // Build pagination state from view-diff cursors collected
                // during the unread diff phase. read/later cursors arrive
                // after initial-data-complete and are applied via fetchedVisibilityFilters.
                const allViews = viewsStore.getState().views;
                const pendingViewCursors = get()._pendingViewCursors;
                const lastItemByView = get()._lastItemByView;
                const fetchedFilters: Record<number, Set<VisibilityFilter>> = {
                  // Merge any filters already tracked from view-diff chunks
                  ...get().fetchedVisibilityFilters,
                };
                const paginationState: Record<
                  number,
                  Partial<Record<VisibilityFilter, PaginationState>>
                > = {};

                for (const view of allViews) {
                  // Ensure "unread" is always marked as fetched
                  fetchedFilters[view.id] = new Set([
                    ...(fetchedFilters[view.id] ?? []),
                    "unread" as VisibilityFilter,
                  ]);

                  // Use cursor from view-diff chunk if available,
                  // otherwise fall back to oldest item tracking (legacy path)
                  const unreadCursor = pendingViewCursors[view.id]?.unread;
                  const hasUnreadCursor = unreadCursor !== undefined;
                  const lastItem = hasUnreadCursor
                    ? undefined
                    : lastItemByView[view.id];

                  const cursor: PaginationCursor = hasUnreadCursor
                    ? unreadCursor
                    : lastItem
                      ? { postedAt: lastItem.postedAt, id: lastItem.id }
                      : null;
                  const hasMore = hasUnreadCursor
                    ? cursor !== null
                    : lastItem !== undefined;

                  paginationState[view.id] = {
                    unread: {
                      cursor,
                      hasMore,
                      isFetching: false,
                    },
                  };
                }

                // Mark initial data loading as complete. If feeds need RSS fetching,
                // the subsequent "refresh-start" chunk will transition the machine.
                set({
                  fetchFeedItemsLastFetchedAt: Date.now(),
                  fetchedVisibilityFilters: fetchedFilters,
                  viewPaginationState: paginationState,
                  _lastItemByView: {}, // Clear after use
                  // Don't clear _pendingViewCursors — read/later cursors arrive after this
                });
                loadingActor.send({ type: "INITIAL_DATA_COMPLETE" });

                // Invalidate subscription query so active feed count updates
                void getQueryClient().invalidateQueries({
                  queryKey: orpc.subscription.getStatus.queryOptions().queryKey,
                });

                break;
              }

              case "feed-items": {
                // Build a single updates object to avoid multiple set() calls
                const updates: Partial<ApplicationStore> = {};

                // Track the current view ID from the first feed-items chunk
                const firstView = viewsStore.getState().views[0];
                const viewId = initialChunk.viewId;
                if (get().currentViewId === null && viewId === firstView?.id) {
                  updates.currentViewId = viewId;
                }

                // Merge feed items inline (single copy + sort)
                const feedItemsDict = { ...get().feedItemsDict };
                const feedItemsOrder = [...get().feedItemsOrder];
                const existingIds = new Set(feedItemsOrder);

                for (const item of initialChunk.feedItems) {
                  feedItemsDict[item.id] = item;
                  if (!existingIds.has(item.id)) {
                    feedItemsOrder.push(item.id);
                    existingIds.add(item.id);
                  }
                }

                updates.feedItemsDict = feedItemsDict;
                updates.feedItemsOrder = feedItemsOrder.sort(
                  sortFeedItemsOrderByDate(feedItemsDict),
                );

                // Only track view-specific data if viewId is present
                if (viewId !== undefined) {
                  // Track oldest item per view for cursor computation
                  const lastItemByView = { ...get()._lastItemByView };
                  for (const item of initialChunk.feedItems) {
                    const currentOldest = lastItemByView[viewId];
                    const itemTime =
                      item.postedAt instanceof Date
                        ? item.postedAt.getTime()
                        : new Date(item.postedAt).getTime();
                    const currentTime =
                      currentOldest?.postedAt instanceof Date
                        ? currentOldest.postedAt.getTime()
                        : currentOldest
                          ? new Date(currentOldest.postedAt).getTime()
                          : Infinity;

                    if (!currentOldest || itemTime < currentTime) {
                      lastItemByView[viewId] = item;
                    }
                  }
                  updates._lastItemByView = lastItemByView;

                  // Track fetched visibility filter for this view (when fetching non-unread filters)
                  if (
                    initialChunk.visibilityFilter &&
                    initialChunk.visibilityFilter !== "unread"
                  ) {
                    updates.fetchedVisibilityFilters = {
                      ...get().fetchedVisibilityFilters,
                      [viewId]: new Set([
                        ...(get().fetchedVisibilityFilters[viewId] ?? []),
                        initialChunk.visibilityFilter as VisibilityFilter,
                      ]),
                    };
                  }
                }

                set(updates);
                break;
              }

              case "view-items":
                // Items already added to feedItemsDict via feed-items chunk
                // view-items provides view mapping (for future use)
                break;

              case "view-diff": {
                // Server-side diff: apply changes to the local store.
                const feedItemsDict = { ...get().feedItemsDict };
                const feedItemsOrder = [...get().feedItemsOrder];
                const existingIds = new Set(feedItemsOrder);
                applyDiffEntries(
                  feedItemsDict,
                  feedItemsOrder,
                  existingIds,
                  initialChunk.diff,
                );

                const updates: Partial<ApplicationStore> = {
                  feedItemsDict,
                  feedItemsOrder: feedItemsOrder.sort(
                    sortFeedItemsOrderByDate(feedItemsDict),
                  ),
                };

                // Track cursor from this diff chunk
                const viewId = initialChunk.viewId;
                if (viewId !== undefined) {
                  const vf = initialChunk.visibilityFilter as VisibilityFilter;
                  const pendingCursors = { ...get()._pendingViewCursors };
                  pendingCursors[viewId] = {
                    ...pendingCursors[viewId],
                    [vf]: initialChunk.cursor,
                  };
                  updates._pendingViewCursors = pendingCursors;

                  // Track fetched visibility filter
                  if (vf) {
                    updates.fetchedVisibilityFilters = {
                      ...get().fetchedVisibilityFilters,
                      [viewId]: new Set([
                        ...(get().fetchedVisibilityFilters[viewId] ?? []),
                        vf,
                      ]),
                    };
                  }
                }

                // Set current view from first diff chunk
                const firstView = viewsStore.getState().views[0];
                if (get().currentViewId === null && viewId === firstView?.id) {
                  updates.currentViewId = viewId;
                }

                set(updates);
                break;
              }

              case "import-start":
                // Initialize state for streaming import
                set({
                  hasInitialData: true,
                  feedStatusDict: {},
                });
                loadingActor.send({
                  type: "IMPORT_START",
                  totalFeeds: initialChunk.totalFeeds,
                });
                break;

              case "import-limit-warning":
                loadingActor.send({
                  type: "IMPORT_LIMIT_WARNING",
                  deactivatedCount: initialChunk.deactivatedCount,
                  maxActiveFeeds: initialChunk.maxActiveFeeds,
                });
                break;

              case "import-feed-inserted":
                // Add the newly inserted feed to the feeds store
                feedsStore.getState().add(initialChunk.feed);
                break;

              case "import-feed-error": {
                console.error(
                  `Import error for ${initialChunk.feedUrl}: ${initialChunk.error}`,
                );
                loadingActor.send({
                  type: "IMPORT_FEED_ERROR",
                  feedUrl: initialChunk.feedUrl,
                });
                break;
              }

              case "error":
                console.error("Initial data error:", initialChunk.message);
                break;
            }
            break;
          }

          case "revalidate": {
            switch (chunk.type) {
              case "views":
                viewsStore.getState().set(chunk.views);
                break;

              case "view-feeds":
                get().setViewFeedIds(chunk.viewId, chunk.feedIds);
                break;

              case "feed-items":
                mergeFeedItems(chunk.feedItems);
                break;

              case "error":
                console.error("Revalidate error:", chunk.message);
                break;
            }
            break;
          }

          case "visibility": {
            if (chunk.type === "error") {
              console.error("Visibility fetch error:", chunk.message);
              break;
            }

            if (chunk.type === "view-diff") {
              const feedItemsDict = { ...get().feedItemsDict };
              const feedItemsOrder = [...get().feedItemsOrder];
              const existingIds = new Set(feedItemsOrder);
              applyDiffEntries(
                feedItemsDict,
                feedItemsOrder,
                existingIds,
                chunk.diff,
              );

              const vf = chunk.visibilityFilter as VisibilityFilter;
              set({
                feedItemsDict,
                feedItemsOrder: feedItemsOrder.sort(
                  sortFeedItemsOrderByDate(feedItemsDict),
                ),
                viewPaginationState: {
                  ...get().viewPaginationState,
                  [chunk.viewId]: {
                    ...get().viewPaginationState[chunk.viewId],
                    [vf]: {
                      cursor: chunk.cursor,
                      hasMore: chunk.hasMore,
                      isFetching: false,
                    },
                  },
                },
                fetchedVisibilityFilters: {
                  ...get().fetchedVisibilityFilters,
                  [chunk.viewId]: new Set([
                    ...(get().fetchedVisibilityFilters[chunk.viewId] ?? []),
                    vf,
                  ]),
                },
              });
              break;
            }

            // Legacy: chunk.type is "feed-items"
            if (chunk.type === "feed-items") {
              mergeFeedItems(chunk.feedItems);

              const visibilityFilter =
                chunk.visibilityFilter as VisibilityFilter;
              set({
                viewPaginationState: {
                  ...get().viewPaginationState,
                  [chunk.viewId]: {
                    ...get().viewPaginationState[chunk.viewId],
                    [visibilityFilter]: {
                      cursor: chunk.nextCursor,
                      hasMore: chunk.hasMore,
                      isFetching: false,
                    },
                  },
                },
                fetchedVisibilityFilters: {
                  ...get().fetchedVisibilityFilters,
                  [chunk.viewId]: new Set([
                    ...(get().fetchedVisibilityFilters[chunk.viewId] ?? []),
                    visibilityFilter,
                  ]),
                },
              });
            }
            break;
          }

          case "feed": {
            if (chunk.type === "error") {
              console.error("Feed fetch error:", chunk.message);
              break;
            }

            // chunk.type is "feed-items"
            mergeFeedItems(chunk.feedItems);

            // Update pagination state for this feed/visibility filter
            const visibilityFilter = chunk.visibilityFilter as VisibilityFilter;
            set({
              feedPaginationState: {
                ...get().feedPaginationState,
                [chunk.feedId]: {
                  ...get().feedPaginationState[chunk.feedId],
                  [visibilityFilter]: {
                    cursor: chunk.nextCursor,
                    hasMore: chunk.hasMore,
                    isFetching: false,
                  },
                },
              },
              fetchedFeedFilters: {
                ...get().fetchedFeedFilters,
                [chunk.feedId]: new Set([
                  ...(get().fetchedFeedFilters[chunk.feedId] ?? []),
                  visibilityFilter,
                ]),
              },
            });
            break;
          }

          case "category": {
            if (chunk.type === "error") {
              console.error("Category fetch error:", chunk.message);
              break;
            }

            // chunk.type is "feed-items"
            mergeFeedItems(chunk.feedItems);

            // Update pagination state for this category/visibility filter
            const visibilityFilter = chunk.visibilityFilter as VisibilityFilter;
            set({
              categoryPaginationState: {
                ...get().categoryPaginationState,
                [chunk.categoryId]: {
                  ...get().categoryPaginationState[chunk.categoryId],
                  [visibilityFilter]: {
                    cursor: chunk.nextCursor,
                    hasMore: chunk.hasMore,
                    isFetching: false,
                  },
                },
              },
              fetchedCategoryFilters: {
                ...get().fetchedCategoryFilters,
                [chunk.categoryId]: new Set([
                  ...(get().fetchedCategoryFilters[chunk.categoryId] ?? []),
                  visibilityFilter,
                ]),
              },
            });
            break;
          }
        }
      },

      processChunks: (payloads: PublishedChunk[]) => {
        if (payloads.length === 0) return;
        if (payloads.length === 1) {
          get().processChunk(payloads[0]!);
          return;
        }

        // Accumulate batchable chunks, flushing before any non-batchable chunk
        // to preserve ordering (e.g. initial-data-complete must see updated cursors)
        type InitialFeedItemPayload = Extract<
          PublishedChunk,
          { source: "initial" }
        > & {
          chunk: { type: "feed-items" };
        };
        type InitialViewDiffPayload = Extract<
          PublishedChunk,
          { source: "initial" }
        > & {
          chunk: {
            type: "view-diff";
            viewId: number;
            visibilityFilter: string;
            diff: DiffEntry[];
            cursor: PaginationCursor;
            hasMore: boolean;
          };
        };
        let pendingInitialFeedItems: InitialFeedItemPayload[] = [];
        let pendingInitialViewDiffs: InitialViewDiffPayload[] = [];
        let pendingInitialFeedStatuses: Array<{
          feedId: number;
          status: FetchFeedsStatus;
        }> = [];
        const flushBatched = () => {
          // Batch initial feed-status updates
          if (pendingInitialFeedStatuses.length > 0) {
            const feedStatusDict = { ...get().feedStatusDict };
            for (const { feedId, status } of pendingInitialFeedStatuses) {
              feedStatusDict[feedId] = status;
            }

            set({ feedStatusDict });
            loadingActor.send({
              type: "FEED_STATUS_BATCH",
              count: pendingInitialFeedStatuses.length,
            });
            pendingInitialFeedStatuses = [];
          }

          // Batch initial view-diff chunks
          if (pendingInitialViewDiffs.length > 0) {
            const updates: Partial<ApplicationStore> = {};

            const feedItemsDict = { ...get().feedItemsDict };
            const feedItemsOrder = [...get().feedItemsOrder];
            const existingIds = new Set(feedItemsOrder);
            const pendingCursors = { ...get()._pendingViewCursors };
            let fetchedVisibilityFilters = get().fetchedVisibilityFilters;
            let filtersChanged = false;

            const firstView = viewsStore.getState().views[0];

            for (const payload of pendingInitialViewDiffs) {
              const chunk = payload.chunk;

              applyDiffEntries(
                feedItemsDict,
                feedItemsOrder,
                existingIds,
                chunk.diff,
              );

              // Track cursor
              const vf = chunk.visibilityFilter as VisibilityFilter;
              pendingCursors[chunk.viewId] = {
                ...pendingCursors[chunk.viewId],
                [vf]: chunk.cursor,
              };

              // Track fetched filters
              if (vf) {
                if (!filtersChanged) {
                  fetchedVisibilityFilters = { ...fetchedVisibilityFilters };
                  filtersChanged = true;
                }
                fetchedVisibilityFilters[chunk.viewId] = new Set([
                  ...(fetchedVisibilityFilters[chunk.viewId] ?? []),
                  vf,
                ]);
              }

              // Set current view from first diff chunk
              if (
                get().currentViewId === null &&
                updates.currentViewId === undefined &&
                chunk.viewId === firstView?.id
              ) {
                updates.currentViewId = chunk.viewId;
              }
            }

            updates.feedItemsDict = feedItemsDict;
            updates.feedItemsOrder = feedItemsOrder.sort(
              sortFeedItemsOrderByDate(feedItemsDict),
            );
            updates._pendingViewCursors = pendingCursors;
            if (filtersChanged) {
              updates.fetchedVisibilityFilters = fetchedVisibilityFilters;
            }

            set(updates);
            pendingInitialViewDiffs = [];
          }

          // Batch initial feed-items (legacy path + RSS refresh items)
          if (pendingInitialFeedItems.length > 0) {
            const updates: Partial<ApplicationStore> = {};

            const feedItemsDict = { ...get().feedItemsDict };
            const feedItemsOrder = [...get().feedItemsOrder];
            const existingIds = new Set(feedItemsOrder);

            const lastItemByView = { ...get()._lastItemByView };
            let fetchedVisibilityFilters = get().fetchedVisibilityFilters;
            let filtersChanged = false;

            const firstView = viewsStore.getState().views[0];

            for (const payload of pendingInitialFeedItems) {
              const chunk = payload.chunk as {
                type: "feed-items";
                viewId?: number;
                feedId?: number;
                feedItems: ApplicationFeedItem[];
                visibilityFilter?: string;
              };

              for (const item of chunk.feedItems) {
                feedItemsDict[item.id] = item;
                if (!existingIds.has(item.id)) {
                  feedItemsOrder.push(item.id);
                  existingIds.add(item.id);
                }
              }

              const viewId = chunk.viewId;
              if (
                get().currentViewId === null &&
                updates.currentViewId === undefined &&
                viewId === firstView?.id
              ) {
                updates.currentViewId = viewId;
              }

              if (viewId !== undefined) {
                for (const item of chunk.feedItems) {
                  const currentOldest = lastItemByView[viewId];
                  const itemTime =
                    item.postedAt instanceof Date
                      ? item.postedAt.getTime()
                      : new Date(item.postedAt).getTime();
                  const currentTime =
                    currentOldest?.postedAt instanceof Date
                      ? currentOldest.postedAt.getTime()
                      : currentOldest
                        ? new Date(currentOldest.postedAt).getTime()
                        : Infinity;

                  if (!currentOldest || itemTime < currentTime) {
                    lastItemByView[viewId] = item;
                  }
                }

                if (
                  chunk.visibilityFilter &&
                  chunk.visibilityFilter !== "unread"
                ) {
                  if (!filtersChanged) {
                    fetchedVisibilityFilters = { ...fetchedVisibilityFilters };
                    filtersChanged = true;
                  }
                  fetchedVisibilityFilters[viewId] = new Set([
                    ...(fetchedVisibilityFilters[viewId] ?? []),
                    chunk.visibilityFilter as VisibilityFilter,
                  ]);
                }
              }
            }

            updates.feedItemsDict = feedItemsDict;
            updates.feedItemsOrder = feedItemsOrder.sort(
              sortFeedItemsOrderByDate(feedItemsDict),
            );
            updates._lastItemByView = lastItemByView;
            if (filtersChanged) {
              updates.fetchedVisibilityFilters = fetchedVisibilityFilters;
            }

            set(updates);
            pendingInitialFeedItems = [];
          }
        };

        for (let i = 0; i < payloads.length; i++) {
          const payload = payloads[i]!;
          const isBatchable =
            payload.source === "initial" &&
            (payload.chunk.type === "feed-items" ||
              payload.chunk.type === "view-diff" ||
              payload.chunk.type === "feed-status");

          if (isBatchable) {
            if (payload.chunk.type === "view-diff") {
              pendingInitialViewDiffs.push(payload as InitialViewDiffPayload);
            } else if (payload.chunk.type === "feed-items") {
              pendingInitialFeedItems.push(payload as InitialFeedItemPayload);
            } else if (payload.chunk.type === "feed-status") {
              pendingInitialFeedStatuses.push({
                feedId: payload.chunk.feedId,
                status: payload.chunk.status,
              });
            }
          } else {
            // Flush accumulated batches before processing non-batchable chunk
            flushBatched();
            get().processChunk(payload);

            // After a refresh-start, defer remaining chunks to the next
            // animation frame so React can render the loading state
            // before feed-status / refresh-complete events resolve it.
            const isRefreshStart =
              payload.source === "initial" &&
              payload.chunk.type === "refresh-start";

            if (isRefreshStart && i < payloads.length - 1) {
              const remaining = payloads.slice(i + 1);
              requestAnimationFrame(() => get().processChunks(remaining));
              return;
            }
          }
        }

        // Flush any remaining batched chunks
        flushBatched();
      },
    }),
    {
      name: "serial-application-store",
      storage: createIDBStorage(),
      version: 1,
      partialize: (state) => ({
        feedItemsDict: state.feedItemsDict,
        feedItemsOrder: state.feedItemsOrder,
        currentViewId: state.currentViewId,
        viewFeedIds: state.viewFeedIds,
        hasInitialData: state.hasInitialData,
        fetchFeedItemsLastFetchedAt: state.fetchFeedItemsLastFetchedAt,
      }),
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<ApplicationStore>;
        const merged = { ...current, ...persistedState };

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
          }
        }

        return merged;
      },
    },
  ),
);

export const feedItemsStore = createSelectorHooks(vanillaApplicationStore);

export const {
  useFeedItemsDict,
  useFeedItemsOrder,
  useFeedStatusDict,
  useFetchFeedItemsLastFetchedAt,
  useHasInitialData,
  useFetchFeedItems,
  useFetchFeedItemsForFeed,
  useFetchNewData,
  useRevalidateView,
  useCurrentViewId,
  useViewFeedIds,
  useViewPaginationState,
  useFetchMoreItems,
  useFeedPaginationState,
  useCategoryPaginationState,
  useFetchMoreItemsForFeed,
  useFetchMoreItemsForCategory,
  useReset: useResetFeedItems,
} = feedItemsStore;

export const useFeedItemValue = (id: string) => {
  return useStore(
    feedItemsStore,
    useShallow((store) => store.feedItemsDict[id]),
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
