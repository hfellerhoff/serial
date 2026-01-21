import { createStore, useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { orpcRouterClient } from "../orpc";
import { sortFeedItemsOrderByDate } from "../sortFeedItems";
import { contentCategoriesStore } from "./content-categories/store";
import { createSelectorHooks } from "./createSelectorHooks";
import { feedCategoriesStore } from "./feed-categories/store";
import { feedsStore } from "./feeds/store";
import { viewsStore } from "./views/store";
import type { VisibilityFilter } from "./atoms";
import type { FetchFeedsStatus } from "~/server/rss/fetchFeeds";
import type { ApplicationFeedItem } from "~/server/db/schema";
import type {
  GetItemsByVisibilityChunk,
  PaginationCursor,
} from "~/server/api/routers/initialRouter";
import type { PublishedChunk } from "~/server/api/publisher";

export type PaginationState = {
  cursor: PaginationCursor;
  hasMore: boolean;
  isFetching: boolean;
};

export type ProgressState = {
  fetchType: "idle" | "initial" | "refresh";
  metadataLoaded: boolean;
  totalViews: number;
  viewsWithFeedItems: Set<number>;
  totalFeeds: number;
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
  // Internal: Track oldest item per view during initial data processing for cursor computation
  _lastItemByView: Record<number, ApplicationFeedItem | null>;
};

const vanillaApplicationStore = createStore<ApplicationStore>()(
  // persist(
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
        progressState: {
          fetchType: "idle",
          metadataLoaded: false,
          totalViews: 0,
          viewsWithFeedItems: new Set(),
          totalFeeds: 0,
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

      // Progress is initialized by "refresh-start" chunk from server
      await orpcRouterClient.initial.requestNewData({
        newerThan: new Date(newerThan),
      });
    },

    revalidateView: async (viewId: number) => {
      for await (const chunk of await orpcRouterClient.initial.revalidateView({
        viewId,
      })) {
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
                },
              });
              break;

            case "feeds":
              feedsStore.getState().set(initialChunk.feeds);
              feedsStore.setState({ fetchStatus: "success" });
              // Track total feeds for progress calculation
              set({
                progressState: {
                  ...get().progressState,
                  totalFeeds: initialChunk.feeds.length,
                },
              });
              break;

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

            case "feed-status": {
              const feedStatusDict = { ...get().feedStatusDict };
              feedStatusDict[initialChunk.feedId] = initialChunk.status;

              // Check if all feeds have reported status
              const { totalFeeds } = get().progressState;
              const allFeedsComplete =
                Object.keys(feedStatusDict).length >= totalFeeds &&
                totalFeeds > 0;

              set({
                feedStatusDict,
                ...(allFeedsComplete && { fetchFeedItemsStatus: "success" }),
              });
              break;
            }

            case "initial-data-complete": {
              // Mark "unread" visibility filter as fetched for all views
              const allViews = viewsStore.getState().views;
              const lastItemByView = get()._lastItemByView;
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
                const lastItem = lastItemByView[view.id];
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
                // Note: fetchFeedItemsStatus is set to "success" when all feed-status chunks arrive
                fetchFeedItemsLastFetchedAt: Date.now(),
                fetchedVisibilityFilters: fetchedFilters,
                viewPaginationState: paginationState,
                _lastItemByView: {}, // Clear after use
              });
              break;
            }

            case "feed-items": {
              // Track the current view ID from the first feed-items chunk
              const firstView = viewsStore.getState().views[0];
              const viewId = initialChunk.viewId;
              if (get().currentViewId === null && viewId === firstView?.id) {
                set({ currentViewId: viewId });
              }
              mergeFeedItems(initialChunk.feedItems);

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
                set({ _lastItemByView: lastItemByView });

                // Track that we received feed items for this view (for progress calculation)
                const currentProgressState = get().progressState;
                if (!currentProgressState.viewsWithFeedItems.has(viewId)) {
                  const newViewsWithFeedItems = new Set(
                    currentProgressState.viewsWithFeedItems,
                  );
                  newViewsWithFeedItems.add(viewId);
                  set({
                    progressState: {
                      ...currentProgressState,
                      viewsWithFeedItems: newViewsWithFeedItems,
                    },
                  });
                }

                // Track fetched visibility filter for this view (when fetching non-unread filters)
                if (
                  initialChunk.visibilityFilter &&
                  initialChunk.visibilityFilter !== "unread"
                ) {
                  set({
                    fetchedVisibilityFilters: {
                      ...get().fetchedVisibilityFilters,
                      [viewId]: new Set([
                        ...(get().fetchedVisibilityFilters[viewId] ?? []),
                        initialChunk.visibilityFilter as VisibilityFilter,
                      ]),
                    },
                  });
                }
              }
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
  }),
  //   {
  //     name: "serial", // name of the item in the storage (must be unique)
  //     version: 0,
  //     partialize: (state) => ({
  //       itemsOrder: state.feedItemsOrder,
  //       itemsDict: state.feedItemsDict,
  //       fetchItemsLastFetchedAt: state.fetchFeedItemsLastFetchedAt,
  //     }),
  //   },
  // ),
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

  const {
    fetchType,
    metadataLoaded,
    totalViews,
    viewsWithFeedItems,
    totalFeeds,
  } = progressState;

  if (fetchType === "refresh") {
    // Refresh: 100% based on feed status
    if (totalFeeds === 0) return 0;
    return (Object.keys(feedStatusDict).length / totalFeeds) * 100;
  }

  // Initial fetch
  if (!metadataLoaded) {
    return 10; // Partial progress during metadata loading
  }

  let progress = 20; // Metadata complete = 20%

  // View feed-items progress (20-60%)
  if (totalViews > 0) {
    const viewsProgress = viewsWithFeedItems.size / totalViews;
    progress += viewsProgress * 40;
  }

  // Feed status progress (60-100%)
  if (totalFeeds > 0) {
    const feedStatusProgress = Object.keys(feedStatusDict).length / totalFeeds;
    progress += feedStatusProgress * 40;
  }

  return Math.min(progress, 100);
}
