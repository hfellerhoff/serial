import { createStore, useStore } from "zustand";
import { persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import { orpcRouterClient } from "../orpc";
import { sortFeedItemsOrderByDate } from "../sortFeedItems";
import { contentCategoriesStore } from "./content-categories/store";
import { createSelectorHooks } from "./createSelectorHooks";
import { feedCategoriesStore } from "./feed-categories/store";
import { feedsStore } from "./feeds/store";
import { createIDBStorage } from "./idb-storage";
import { viewFeedsStore } from "./view-feeds/store";
import { viewsStore } from "./views/store";
import type { VisibilityFilter } from "./atoms";
import type { FetchFeedsStatus } from "~/server/rss/fetchFeeds";
import type { ApplicationFeedItem } from "~/server/db/schema";
import type {
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

export type ProgressState = {
  fetchType: "idle" | "initial" | "refresh" | "import";
  metadataLoaded: boolean;
  totalViews: number;
  viewsWithFeedItems: Set<number>;
  totalFeeds: number;
  importErrors: number;
  failedImportUrls: Set<string>;
  importDeactivatedCount: number;
  importMaxActiveFeeds: number;
};

export type ApplicationStore = {
  reset: () => void;
  feedItemsOrder: string[];
  setFeedItemsOrder: (itemsOrder: string[]) => void;
  feedItemsDict: Record<string, ApplicationFeedItem>;
  feedStatusDict: Record<number, FetchFeedsStatus>;
  progressState: ProgressState;
  setFeedItemsDict: (itemsDict: Record<string, ApplicationFeedItem>) => void;
  setFeedItem: (id: string, item: ApplicationFeedItem) => void;
  fetchFeedItems: () => Promise<void>;
  fetchFeedItemsForFeed: (feedId: number) => Promise<void>;
  fetchByView: () => Promise<void>;
  fetchNewData: () => Promise<void>;
  revalidateView: (viewId: number) => Promise<void>;
  fetchFeedItemsLastFetchedAt: number | null;
  fetchFeedItemsStatus: "idle" | "fetching" | "success";
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
  // Internal: Store view cursors from manifest mode to use during initial-data-complete
  _pendingViewCursors: Record<number, PaginationCursor> | null;
};

const vanillaApplicationStore = createStore<ApplicationStore>()(
  persist(
    (set, get) => ({
      reset: () =>
        set({
          feedItemsOrder: [],
          feedItemsDict: {},
          feedStatusDict: {},
          fetchFeedItemsLastFetchedAt: null,
          fetchFeedItemsStatus: "idle",
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
          _pendingViewCursors: null,
          progressState: {
            fetchType: "idle",
            metadataLoaded: false,
            totalViews: 0,
            viewsWithFeedItems: new Set(),
            totalFeeds: 0,
            importErrors: 0,
            failedImportUrls: new Set(),
            importDeactivatedCount: 0,
            importMaxActiveFeeds: 0,
          },
        }),
      feedItemsOrder: [],
      setFeedItemsOrder: (itemsOrder) => set({ feedItemsOrder: itemsOrder }),
      feedItemsDict: {},
      feedStatusDict: {},
      progressState: {
        fetchType: "idle",
        metadataLoaded: false,
        totalViews: 0,
        viewsWithFeedItems: new Set(),
        totalFeeds: 0,
        importErrors: 0,
        failedImportUrls: new Set(),
        importDeactivatedCount: 0,
        importMaxActiveFeeds: 0,
      },
      setFeedItemsDict: (itemsDict) => set({ feedItemsDict: itemsDict }),
      setFeedItem: (id, item) =>
        set({
          feedItemsDict: {
            ...get().feedItemsDict,
            [id]: item,
          },
        }),
      fetchFeedItemsLastFetchedAt: null,
      fetchFeedItemsStatus: "idle",
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
      _pendingViewCursors: null,

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

            // chunk.type is "feed-items" at this point
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

            // chunk.type is "feed-items" at this point
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
        if (get().fetchFeedItemsStatus === "fetching") return;

        console.log("FETCHING");

        set({
          fetchFeedItemsStatus: "fetching",
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
          fetchFeedItemsStatus: "success",
          fetchFeedItemsLastFetchedAt: Date.now(),
          feedItemsDict: { ...get().feedItemsDict },
          feedItemsOrder: [...get().feedItemsOrder].sort(
            sortFeedItemsOrderByDate(get().feedItemsDict),
          ),
          feedStatusDict: { ...get().feedStatusDict },
        });
      },

      fetchFeedItemsForFeed: async (feedId: number) => {
        set({
          fetchFeedItemsStatus: "fetching",
        });

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
          fetchFeedItemsStatus: "success",
          feedItemsOrder: [...get().feedItemsOrder].sort(
            sortFeedItemsOrderByDate(get().feedItemsDict),
          ),
        });
      },

      fetchByView: async () => {
        if (get().fetchFeedItemsStatus === "fetching") return;

        set({
          fetchFeedItemsStatus: "fetching",
          feedStatusDict: {},
        });

        let lastUpdateTime = 0;
        const DEBOUNCE_TIME = 1000;

        // Track the oldest item (by postedAt) for each view to initialize pagination cursors
        const lastItemByView = new Map<number, ApplicationFeedItem>();

        for await (const incomingChunk of await orpcRouterClient.initial.getAllByView()) {
          const timeSinceLastUpdate = Date.now() - lastUpdateTime;
          const timeToWait = DEBOUNCE_TIME - timeSinceLastUpdate;
          const shouldWaitToRender = timeToWait > 0;

          // Handle different chunk types
          switch (incomingChunk.type) {
            case "views":
              // Set views in views store (including Uncategorized)
              viewsStore.getState().set(incomingChunk.views);
              viewsStore.setState({ fetchStatus: "success" });
              // Show UI immediately when views are received
              set({ hasInitialData: true });
              break;

            case "feeds":
              // Set feeds in feeds store
              feedsStore.getState().set(incomingChunk.feeds);
              feedsStore.setState({ fetchStatus: "success" });
              break;

            case "content-categories":
              // Set content categories in content categories store
              contentCategoriesStore
                .getState()
                .set(incomingChunk.contentCategories);
              contentCategoriesStore.setState({ fetchStatus: "success" });
              break;

            case "feed-categories":
              // Set feed categories in feed categories store
              feedCategoriesStore.getState().set(incomingChunk.feedCategories);
              feedCategoriesStore.setState({ fetchStatus: "success" });
              break;

            case "view-feeds":
              // Store the feed IDs for this view
              get().setViewFeedIds(incomingChunk.viewId, incomingChunk.feedIds);
              break;

            case "feed-status": {
              const feedStatusDict = shouldWaitToRender
                ? get().feedStatusDict
                : { ...get().feedStatusDict };

              feedStatusDict[incomingChunk.feedId] = incomingChunk.status;

              set({ feedStatusDict });

              if (!shouldWaitToRender) {
                lastUpdateTime = Date.now();
              }
              break;
            }

            case "initial-data-complete": {
              // Fetch view-feed assignments (not part of SSE chunks)
              viewFeedsStore.getState().fetch();

              // Mark "unread" visibility filter as fetched for all views
              const allViews = viewsStore.getState().views;
              const fetchedFilters: Record<number, Set<VisibilityFilter>> = {};
              const paginationState: Record<
                number,
                Partial<Record<VisibilityFilter, PaginationState>>
              > = {};

              for (const view of allViews) {
                fetchedFilters[view.id] = new Set([
                  "unread",
                ] as VisibilityFilter[]);

                // Compute cursor from the oldest item we received for this view
                const lastItem = lastItemByView.get(view.id);
                const cursor = lastItem
                  ? { postedAt: lastItem.postedAt, id: lastItem.id }
                  : null;

                paginationState[view.id] = {
                  unread: {
                    cursor,
                    hasMore: lastItem !== undefined, // Only has more if we received items
                    isFetching: false,
                  },
                };
              }

              set({
                fetchedVisibilityFilters: fetchedFilters,
                viewPaginationState: paginationState,
              });
              break;
            }

            case "feed-items": {
              // Track the current view ID from the first feed-items chunk
              const firstView = viewsStore.getState().views[0];
              if (
                get().currentViewId === null &&
                incomingChunk.viewId === firstView?.id
              ) {
                set({ currentViewId: incomingChunk.viewId });
              }

              const feedItemsDict = shouldWaitToRender
                ? get().feedItemsDict
                : { ...get().feedItemsDict };

              const feedItemsOrder = shouldWaitToRender
                ? get().feedItemsOrder
                : [...get().feedItemsOrder];

              const incomingFeedItems = incomingChunk.feedItems;
              const existingIds = new Set(feedItemsOrder);

              incomingFeedItems.forEach((item) => {
                feedItemsDict[item.id] = item;

                if (!existingIds.has(item.id)) {
                  feedItemsOrder.push(item.id);
                  existingIds.add(item.id);
                }
              });

              // Track the oldest item (by postedAt) for this view to use as cursor
              const viewId = incomingChunk.viewId;
              if (viewId !== undefined) {
                for (const item of incomingFeedItems) {
                  const currentOldest = lastItemByView.get(viewId);
                  if (
                    !currentOldest ||
                    item.postedAt.getTime() < currentOldest.postedAt.getTime()
                  ) {
                    lastItemByView.set(viewId, item);
                  }
                }
              }

              set({
                feedItemsDict,
                feedItemsOrder: feedItemsOrder.sort(
                  sortFeedItemsOrderByDate(get().feedItemsDict),
                ),
              });

              if (!shouldWaitToRender) {
                lastUpdateTime = Date.now();
              }
              break;
            }
          }
        }

        // Mark fetch statuses as success for all stores
        viewsStore.setState({ fetchStatus: "success" });
        feedsStore.setState({ fetchStatus: "success" });
        contentCategoriesStore.setState({ fetchStatus: "success" });
        feedCategoriesStore.setState({ fetchStatus: "success" });
        // viewFeedsStore manages its own fetchStatus via its fetch() method

        set({
          fetchFeedItemsStatus: "success",
          fetchFeedItemsLastFetchedAt: Date.now(),
          feedItemsDict: { ...get().feedItemsDict },
          feedItemsOrder: [...get().feedItemsOrder].sort(
            sortFeedItemsOrderByDate(get().feedItemsDict),
          ),
          feedStatusDict: { ...get().feedStatusDict },
        });
      },

      fetchNewData: async () => {
        const newerThan = get().fetchFeedItemsLastFetchedAt;
        if (!newerThan) {
          // No previous fetch timestamp, fall back to fetchByView
          return get().fetchByView();
        }

        // Show loading state immediately so the refresh button responds
        // before SSE chunks arrive. The server's "refresh-start" chunk will
        // update totalFeeds, and "new-data-complete" or "error" will set
        // fetchFeedItemsStatus back to "success".
        set({
          fetchFeedItemsStatus: "fetching",
          feedStatusDict: {},
          progressState: {
            ...get().progressState,
            fetchType: "refresh",
            totalFeeds: 0,
          },
        });

        await orpcRouterClient.initial.requestNewData({
          newerThan: new Date(newerThan),
        });
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
                // Initialize progress tracking for initial fetch
                // Only reset loading state if this is a true initial load (not a metadata refresh)
                if (!get().hasInitialData) {
                  set({
                    hasInitialData: true,
                    fetchFeedItemsStatus: "fetching",
                    feedStatusDict: {}, // Clear stale entries from previous fetch
                    progressState: {
                      fetchType: "initial",
                      metadataLoaded: false,
                      totalViews: initialChunk.views.length,
                      viewsWithFeedItems: new Set(),
                      totalFeeds: 0,
                      importErrors: 0,
                      failedImportUrls: new Set(),
                      importDeactivatedCount: 0,
                      importMaxActiveFeeds: 0,
                    },
                  });
                }
                break;

              case "feeds": {
                feedsStore.getState().set(initialChunk.feeds);
                feedsStore.setState({ fetchStatus: "success" });
                // Track total feeds for progress calculation
                // Don't overwrite totalFeeds during import — the import-start
                // chunk already set the authoritative count and this post-import
                // feeds chunk may differ (e.g. pre-existing feeds).
                if (get().progressState.fetchType !== "import") {
                  set({
                    progressState: {
                      ...get().progressState,
                      totalFeeds: initialChunk.feeds.length,
                    },
                  });
                }

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
                // Mark metadata as loaded (this is the last metadata chunk)
                set({
                  progressState: {
                    ...get().progressState,
                    metadataLoaded: true,
                  },
                });
                break;

              case "view-feeds":
                get().setViewFeedIds(initialChunk.viewId, initialChunk.feedIds);
                break;

              case "refresh-start":
                // Re-enter fetching state for RSS refresh phase and update totalFeeds for progress tracking.
                // Explicitly set fetchType to "initial" so that returning visits (where the views handler
                // skipped initialising progressState) still drive the FeedLoader progress bar rather than
                // the refresh button's loading state, which uses fetchType === "refresh".
                set({
                  fetchFeedItemsStatus: "fetching",
                  feedStatusDict: {},
                  progressState: {
                    ...get().progressState,
                    fetchType: "initial",
                    totalFeeds: initialChunk.totalFeeds,
                  },
                });
                break;

              case "feed-status": {
                const feedStatusDict = { ...get().feedStatusDict };
                feedStatusDict[initialChunk.feedId] = initialChunk.status;

                // Check if all feeds have reported status (successes + errors)
                const { totalFeeds, importErrors } = get().progressState;
                const allFeedsComplete =
                  Object.keys(feedStatusDict).length + importErrors >=
                    totalFeeds && totalFeeds > 0;

                set({
                  feedStatusDict,
                  ...(allFeedsComplete && { fetchFeedItemsStatus: "success" }),
                });
                break;
              }

              case "initial-data-complete": {
                // Fetch view-feed assignments (not part of SSE chunks)
                viewFeedsStore.getState().fetch();

                // Mark "unread" visibility filter as fetched for all views
                const allViews = viewsStore.getState().views;
                const lastItemByView = get()._lastItemByView;
                const pendingViewCursors = get()._pendingViewCursors;
                const fetchedFilters: Record<
                  number,
                  Set<VisibilityFilter>
                > = {};
                const paginationState: Record<
                  number,
                  Partial<Record<VisibilityFilter, PaginationState>>
                > = {};

                for (const view of allViews) {
                  fetchedFilters[view.id] = new Set([
                    "unread",
                  ] as VisibilityFilter[]);

                  // Use pending view cursors from manifest mode if available,
                  // otherwise compute from the oldest item received for this view
                  const pendingCursor = pendingViewCursors?.[view.id];
                  const usePendingCursor = pendingCursor !== undefined;
                  const lastItem = usePendingCursor
                    ? undefined
                    : lastItemByView[view.id];

                  const cursor: PaginationCursor = usePendingCursor
                    ? pendingCursor
                    : lastItem
                      ? { postedAt: lastItem.postedAt, id: lastItem.id }
                      : null;
                  const hasMore = usePendingCursor
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
                // the subsequent "refresh-start" chunk will re-enter the "fetching" state.
                set({
                  fetchFeedItemsStatus: "success",
                  fetchFeedItemsLastFetchedAt: Date.now(),
                  fetchedVisibilityFilters: fetchedFilters,
                  viewPaginationState: paginationState,
                  _lastItemByView: {}, // Clear after use
                  _pendingViewCursors: null, // Clear after use
                });

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

                  // Track that we received feed items for this view (for progress calculation)
                  const currentProgressState = get().progressState;
                  if (!currentProgressState.viewsWithFeedItems.has(viewId)) {
                    const newViewsWithFeedItems = new Set(
                      currentProgressState.viewsWithFeedItems,
                    );
                    newViewsWithFeedItems.add(viewId);
                    updates.progressState = {
                      ...currentProgressState,
                      viewsWithFeedItems: newViewsWithFeedItems,
                    };
                  }

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

              case "item-manifest": {
                // Delta sync: detect new and changed items within the manifest scope.
                // The manifest is scoped to the initial items per view per visibility,
                // so it does NOT cover paginated items. Deletion is handled separately
                // in the "feeds" chunk handler via feed-level comparison.
                const manifestMap = new Map<
                  string,
                  { contentHash: string | null; updatedAt: Date }
                >();
                for (const item of initialChunk.items) {
                  manifestMap.set(item.id, {
                    contentHash: item.contentHash,
                    updatedAt: item.updatedAt,
                  });
                }

                const manifestCurrentDict = get().feedItemsDict;

                // Collect stale item IDs: new items in initial scope + changed items
                const staleItemIds: string[] = [];
                const staleIdSet = new Set<string>();

                // New items: in initial scope but not in client cache
                for (const id of initialChunk.initialScopeIds) {
                  if (!manifestCurrentDict[id] && !staleIdSet.has(id)) {
                    staleItemIds.push(id);
                    staleIdSet.add(id);
                  }
                }

                // Changed items: in both client and manifest, but different hash or updatedAt
                for (const [id, manifestItem] of manifestMap) {
                  if (staleIdSet.has(id)) continue;
                  const cachedItem = manifestCurrentDict[id];
                  if (!cachedItem) continue;

                  // Compare contentHash (null === null means unchanged)
                  if (manifestItem.contentHash !== cachedItem.contentHash) {
                    staleItemIds.push(id);
                    staleIdSet.add(id);
                    continue;
                  }

                  // Compare updatedAt (handle Date vs string from SSE/IDB)
                  const manifestTime =
                    manifestItem.updatedAt instanceof Date
                      ? manifestItem.updatedAt.getTime()
                      : new Date(
                          manifestItem.updatedAt as unknown as string,
                        ).getTime();
                  const cachedUpdatedAt = cachedItem.updatedAt;
                  const cachedTime =
                    cachedUpdatedAt instanceof Date
                      ? cachedUpdatedAt.getTime()
                      : new Date(
                          cachedUpdatedAt as unknown as string,
                        ).getTime();

                  if (manifestTime !== cachedTime) {
                    staleItemIds.push(id);
                    staleIdSet.add(id);
                  }
                }

                set({ _pendingViewCursors: initialChunk.viewCursors });

                // Request stale items from server (fire-and-forget)
                if (staleItemIds.length > 0) {
                  void orpcRouterClient.initial.requestStaleItems({
                    itemIds: staleItemIds,
                  });
                }

                break;
              }

              case "import-start":
                // Initialize progress tracking for streaming import
                set({
                  hasInitialData: true,
                  fetchFeedItemsStatus: "fetching",
                  feedStatusDict: {},
                  progressState: {
                    fetchType: "import",
                    metadataLoaded: false,
                    totalViews: 0,
                    viewsWithFeedItems: new Set(),
                    totalFeeds: initialChunk.totalFeeds,
                    importErrors: 0,
                    failedImportUrls: new Set(),
                    importDeactivatedCount: 0,
                    importMaxActiveFeeds: 0,
                  },
                });
                break;

              case "import-limit-warning":
                set({
                  progressState: {
                    ...get().progressState,
                    importDeactivatedCount: initialChunk.deactivatedCount,
                    importMaxActiveFeeds: initialChunk.maxActiveFeeds,
                  },
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
                const currentProgress = get().progressState;
                const newFailedUrls = new Set(currentProgress.failedImportUrls);
                newFailedUrls.add(initialChunk.feedUrl);
                const newImportErrors = currentProgress.importErrors + 1;

                // Check if all feeds are accounted for (successes + errors)
                const allFeedsComplete =
                  Object.keys(get().feedStatusDict).length + newImportErrors >=
                    currentProgress.totalFeeds &&
                  currentProgress.totalFeeds > 0;

                set({
                  progressState: {
                    ...currentProgress,
                    importErrors: newImportErrors,
                    failedImportUrls: newFailedUrls,
                  },
                  ...(allFeedsComplete && { fetchFeedItemsStatus: "success" }),
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

            // chunk.type is "feed-items"
            mergeFeedItems(chunk.feedItems);

            // Update pagination state for this view/visibility filter
            const visibilityFilter = chunk.visibilityFilter as VisibilityFilter;
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

          case "new-data": {
            if (chunk.type === "refresh-start") {
              // Initialize progress tracking for refresh
              set({
                fetchFeedItemsStatus: "fetching",
                feedStatusDict: {},
                progressState: {
                  fetchType: "refresh",
                  metadataLoaded: true,
                  totalViews: 0,
                  viewsWithFeedItems: new Set(),
                  totalFeeds: chunk.totalFeeds,
                  importErrors: 0,
                  failedImportUrls: new Set(),
                  importDeactivatedCount: 0,
                  importMaxActiveFeeds: 0,
                },
              });
              break;
            }

            if (chunk.type === "feed-status") {
              // Update feedStatusDict for progress tracking
              const feedStatusDict = { ...get().feedStatusDict };
              feedStatusDict[chunk.feedId] = chunk.status;
              set({ feedStatusDict });
              break;
            }

            if (chunk.type === "feed-items") {
              // Merge new items into feedItemsDict
              const newDict = { ...get().feedItemsDict };
              const feedItemsOrder = [...get().feedItemsOrder];
              const existingIds = new Set(feedItemsOrder);

              for (const item of chunk.feedItems) {
                newDict[item.id] = item;
                if (!existingIds.has(item.id)) {
                  feedItemsOrder.push(item.id);
                  existingIds.add(item.id);
                }
              }
              set({
                feedItemsDict: newDict,
                feedItemsOrder: feedItemsOrder.sort(
                  sortFeedItemsOrderByDate(newDict),
                ),
              });
              break;
            }

            if (chunk.type === "view-items") {
              // Items are already added to feedItemsDict via feed-items chunk
              // view-items just tells us which views they belong to (for future use)
              break;
            }

            if (chunk.type === "new-data-complete") {
              set({
                fetchFeedItemsStatus: "success",
                fetchFeedItemsLastFetchedAt: Date.now(),
              });
              break;
            }

            if (chunk.type === "error") {
              console.error("New data fetch error:", chunk.message);
              set({ fetchFeedItemsStatus: "success" }); // Reset status on error
            }
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
        // to preserve ordering (e.g. initial-data-complete must see updated _lastItemByView)
        type InitialFeedItemPayload = Extract<
          PublishedChunk,
          { source: "initial" }
        > & {
          chunk: { type: "feed-items" };
        };
        let pendingInitialFeedItems: InitialFeedItemPayload[] = [];
        let pendingInitialFeedStatuses: Array<{
          feedId: number;
          status: FetchFeedsStatus;
        }> = [];
        let pendingNewDataFeedItems: Array<{
          feedItems: ApplicationFeedItem[];
        }> = [];

        const flushBatched = () => {
          // Batch initial feed-status updates
          if (pendingInitialFeedStatuses.length > 0) {
            const feedStatusDict = { ...get().feedStatusDict };
            for (const { feedId, status } of pendingInitialFeedStatuses) {
              feedStatusDict[feedId] = status;
            }

            const { totalFeeds, importErrors } = get().progressState;
            const allFeedsComplete =
              Object.keys(feedStatusDict).length + importErrors >= totalFeeds &&
              totalFeeds > 0;

            set({
              feedStatusDict,
              ...(allFeedsComplete && {
                fetchFeedItemsStatus: "success" as const,
              }),
            });
            pendingInitialFeedStatuses = [];
          }

          // Batch initial feed-items
          if (pendingInitialFeedItems.length > 0) {
            const updates: Partial<ApplicationStore> = {};

            const feedItemsDict = { ...get().feedItemsDict };
            const feedItemsOrder = [...get().feedItemsOrder];
            const existingIds = new Set(feedItemsOrder);

            const lastItemByView = { ...get()._lastItemByView };
            let progressState = get().progressState;
            let progressChanged = false;
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

                if (!progressState.viewsWithFeedItems.has(viewId)) {
                  if (!progressChanged) {
                    progressState = {
                      ...progressState,
                      viewsWithFeedItems: new Set(
                        progressState.viewsWithFeedItems,
                      ),
                    };
                    progressChanged = true;
                  }
                  progressState.viewsWithFeedItems.add(viewId);
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
            if (progressChanged) {
              updates.progressState = progressState;
            }
            if (filtersChanged) {
              updates.fetchedVisibilityFilters = fetchedVisibilityFilters;
            }

            set(updates);
            pendingInitialFeedItems = [];
          }

          // Batch new-data feed-items
          if (pendingNewDataFeedItems.length > 0) {
            const newDict = { ...get().feedItemsDict };
            const feedItemsOrder = [...get().feedItemsOrder];
            const existingIds = new Set(feedItemsOrder);

            for (const { feedItems } of pendingNewDataFeedItems) {
              for (const item of feedItems) {
                newDict[item.id] = item;
                if (!existingIds.has(item.id)) {
                  feedItemsOrder.push(item.id);
                  existingIds.add(item.id);
                }
              }
            }

            set({
              feedItemsDict: newDict,
              feedItemsOrder: feedItemsOrder.sort(
                sortFeedItemsOrderByDate(newDict),
              ),
            });
            pendingNewDataFeedItems = [];
          }
        };

        for (const payload of payloads) {
          const isBatchable =
            (payload.source === "initial" &&
              (payload.chunk.type === "feed-items" ||
                payload.chunk.type === "feed-status")) ||
            (payload.source === "new-data" &&
              payload.chunk.type === "feed-items");

          if (isBatchable) {
            if (
              payload.source === "initial" &&
              payload.chunk.type === "feed-items"
            ) {
              pendingInitialFeedItems.push(payload as InitialFeedItemPayload);
            } else if (
              payload.source === "initial" &&
              payload.chunk.type === "feed-status"
            ) {
              pendingInitialFeedStatuses.push({
                feedId: payload.chunk.feedId,
                status: payload.chunk.status,
              });
            } else if (
              payload.source === "new-data" &&
              payload.chunk.type === "feed-items"
            ) {
              pendingNewDataFeedItems.push({
                feedItems: payload.chunk.feedItems,
              });
            }
          } else {
            // Flush accumulated batches before processing non-batchable chunk
            flushBatched();
            get().processChunk(payload);
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
  useFetchFeedItemsStatus,
  useHasInitialData,
  useFetchFeedItems,
  useFetchFeedItemsForFeed,
  useFetchByView,
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
  useProgressState,
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

export function useLoadingProgress(): number {
  const progressState = useProgressState();
  const fetchStatus = useFetchFeedItemsStatus();
  const feedStatusDict = useFeedStatusDict();

  if (fetchStatus !== "fetching") {
    return 0;
  }

  const { totalFeeds, importErrors } = progressState;

  // Both initial and refresh: 0-100% based on feed status (successes + errors)
  if (totalFeeds === 0) return 0;
  return (
    ((Object.keys(feedStatusDict).length + importErrors) / totalFeeds) * 100
  );
}
