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
  GetByViewChunk,
  GetItemsByCategoryIdChunk,
  GetItemsByFeedChunk,
  GetItemsByVisibilityChunk,
  PaginationCursor,
  RevalidateViewChunk,
} from "~/server/api/routers/initialRouter";

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
  fetchByView: () => Promise<void>;
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
  // Fetch items for ALL views with a specific visibility filter
  fetchItemsForAllViews: (visibilityFilter: VisibilityFilter) => Promise<void>;
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
  // Fetch items for a specific feed (lazy loading)
  fetchItemsForFeed: (
    feedId: number,
    visibilityFilter: VisibilityFilter,
  ) => Promise<void>;
  // Fetch items for a specific category (lazy loading)
  fetchItemsForCategory: (
    categoryId: number,
    visibilityFilter: VisibilityFilter,
  ) => Promise<void>;
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
      }),
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

    fetchItemsForAllViews: async (visibilityFilter) => {
      const allViews = viewsStore.getState().views;
      const state = get();

      // Check if all views already have this visibility filter fetched
      const viewsNeedingFetch = allViews.filter((view) => {
        const fetchedFilters = state.fetchedVisibilityFilters[view.id];
        return !fetchedFilters?.has(visibilityFilter);
      });

      if (viewsNeedingFetch.length === 0) {
        return;
      }

      // Set fetching state for all views that need it
      const updatedPaginationState = { ...state.viewPaginationState };
      for (const view of viewsNeedingFetch) {
        updatedPaginationState[view.id] = {
          ...updatedPaginationState[view.id],
          [visibilityFilter]: {
            cursor: null,
            hasMore: true,
            isFetching: true,
          },
        };
      }
      set({ viewPaginationState: updatedPaginationState });

      try {
        for await (const chunk of (await orpcRouterClient.initial.getAllByView({
          visibilityFilter,
        })) as AsyncIterable<GetByViewChunk>) {
          if (chunk.type === "error") {
            console.error("Error fetching items for all views:", chunk.message);
            continue;
          }

          if (chunk.type === "feed-items") {
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
                [chunk.viewId]: {
                  ...get().viewPaginationState[chunk.viewId],
                  [visibilityFilter]: {
                    cursor: chunk.nextCursor ?? null,
                    hasMore: chunk.hasMore ?? false,
                    isFetching: false,
                  },
                },
              },
            });
          }
        }

        // Mark visibility filter as fetched for all views
        const fetchedFilters = { ...get().fetchedVisibilityFilters };
        for (const view of allViews) {
          fetchedFilters[view.id] = new Set([
            ...(fetchedFilters[view.id] ?? []),
            visibilityFilter,
          ]);
        }
        set({ fetchedVisibilityFilters: fetchedFilters });
      } catch (error) {
        console.error("Error fetching items for all views:", error);
        // Reset fetching state on error for all views
        const updatedState = { ...get().viewPaginationState };
        for (const view of viewsNeedingFetch) {
          updatedState[view.id] = {
            ...updatedState[view.id],
            [visibilityFilter]: {
              cursor: null,
              hasMore: false,
              isFetching: false,
            },
          };
        }
        set({ viewPaginationState: updatedState });
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

    fetchItemsForFeed: async (feedId, visibilityFilter) => {
      const state = get();

      // Check if already fetched for this feed/filter
      const fetchedFilters = state.fetchedFeedFilters[feedId];
      if (fetchedFilters?.has(visibilityFilter)) {
        return;
      }

      // Check if already fetching
      const paginationState =
        state.feedPaginationState[feedId]?.[visibilityFilter];
      if (paginationState?.isFetching) {
        return;
      }

      // Set fetching state
      set({
        feedPaginationState: {
          ...state.feedPaginationState,
          [feedId]: {
            ...state.feedPaginationState[feedId],
            [visibilityFilter]: {
              cursor: null,
              hasMore: true,
              isFetching: true,
            },
          },
        },
      });

      try {
        for await (const chunk of (await orpcRouterClient.initial.getItemsByFeed(
          {
            feedId,
            visibilityFilter,
          },
        )) as AsyncIterable<GetItemsByFeedChunk>) {
          if (chunk.type === "error") {
            console.error("Error fetching items for feed:", chunk.message);
            continue;
          }

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
            feedPaginationState: {
              ...get().feedPaginationState,
              [feedId]: {
                ...get().feedPaginationState[feedId],
                [visibilityFilter]: {
                  cursor: chunk.nextCursor,
                  hasMore: chunk.hasMore,
                  isFetching: false,
                },
              },
            },
          });
        }

        // Mark filter as fetched
        set({
          fetchedFeedFilters: {
            ...get().fetchedFeedFilters,
            [feedId]: new Set([
              ...(get().fetchedFeedFilters[feedId] ?? []),
              visibilityFilter,
            ]),
          },
        });
      } catch (error) {
        console.error("Error fetching items for feed:", error);
        set({
          feedPaginationState: {
            ...get().feedPaginationState,
            [feedId]: {
              ...get().feedPaginationState[feedId],
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

    fetchItemsForCategory: async (categoryId, visibilityFilter) => {
      const state = get();

      // Check if already fetched for this category/filter
      const fetchedFilters = state.fetchedCategoryFilters[categoryId];
      if (fetchedFilters?.has(visibilityFilter)) {
        return;
      }

      // Check if already fetching
      const paginationState =
        state.categoryPaginationState[categoryId]?.[visibilityFilter];
      if (paginationState?.isFetching) {
        return;
      }

      // Set fetching state
      set({
        categoryPaginationState: {
          ...state.categoryPaginationState,
          [categoryId]: {
            ...state.categoryPaginationState[categoryId],
            [visibilityFilter]: {
              cursor: null,
              hasMore: true,
              isFetching: true,
            },
          },
        },
      });

      try {
        for await (const chunk of (await orpcRouterClient.initial.getItemsByCategoryId(
          {
            categoryId,
            visibilityFilter,
          },
        )) as AsyncIterable<GetItemsByCategoryIdChunk>) {
          if (chunk.type === "error") {
            console.error("Error fetching items for category:", chunk.message);
            continue;
          }

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
            categoryPaginationState: {
              ...get().categoryPaginationState,
              [categoryId]: {
                ...get().categoryPaginationState[categoryId],
                [visibilityFilter]: {
                  cursor: chunk.nextCursor,
                  hasMore: chunk.hasMore,
                  isFetching: false,
                },
              },
            },
          });
        }

        // Mark filter as fetched
        set({
          fetchedCategoryFilters: {
            ...get().fetchedCategoryFilters,
            [categoryId]: new Set([
              ...(get().fetchedCategoryFilters[categoryId] ?? []),
              visibilityFilter,
            ]),
          },
        });
      } catch (error) {
        console.error("Error fetching items for category:", error);
        set({
          categoryPaginationState: {
            ...get().categoryPaginationState,
            [categoryId]: {
              ...get().categoryPaginationState[categoryId],
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

      try {
        for await (const chunk of (await orpcRouterClient.initial.getItemsByFeed(
          {
            feedId,
            visibilityFilter,
            cursor: paginationState.cursor,
          },
        )) as AsyncIterable<GetItemsByFeedChunk>) {
          if (chunk.type === "error") {
            console.error("Error fetching more items for feed:", chunk.message);
            continue;
          }

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
            feedPaginationState: {
              ...get().feedPaginationState,
              [feedId]: {
                ...get().feedPaginationState[feedId],
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
        console.error("Error fetching more items for feed:", error);
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

      try {
        for await (const chunk of (await orpcRouterClient.initial.getItemsByCategoryId(
          {
            categoryId,
            visibilityFilter,
            cursor: paginationState.cursor,
          },
        )) as AsyncIterable<GetItemsByCategoryIdChunk>) {
          if (chunk.type === "error") {
            console.error(
              "Error fetching more items for category:",
              chunk.message,
            );
            continue;
          }

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
            categoryPaginationState: {
              ...get().categoryPaginationState,
              [categoryId]: {
                ...get().categoryPaginationState[categoryId],
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
        console.error("Error fetching more items for category:", error);
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

      for await (const incomingChunk of (await orpcRouterClient.initial.getAllByView()) as AsyncIterable<GetByViewChunk>) {
        const timeSinceLastUpdate = Date.now() - lastUpdateTime;
        const timeToWait = DEBOUNCE_TIME - timeSinceLastUpdate;
        const shouldWaitToRender = timeToWait > 0;

        // Handle different chunk types
        switch (incomingChunk.type) {
          case "views":
            // Set views in views store (including Uncategorized)
            viewsStore.getState().set(incomingChunk.views);
            break;

          case "feeds":
            // Set feeds in feeds store
            feedsStore.getState().set(incomingChunk.feeds);
            break;

          case "content-categories":
            // Set content categories in content categories store
            contentCategoriesStore
              .getState()
              .set(incomingChunk.contentCategories);
            break;

          case "feed-categories":
            // Set feed categories in feed categories store
            feedCategoriesStore.getState().set(incomingChunk.feedCategories);
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
            // Initial data is ready - mark all stores as ready and hide loading screen
            viewsStore.setState({ fetchStatus: "success" });
            feedsStore.setState({ fetchStatus: "success" });
            contentCategoriesStore.setState({ fetchStatus: "success" });
            feedCategoriesStore.setState({ fetchStatus: "success" });

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
              paginationState[view.id] = {
                unread: {
                  cursor: null,
                  hasMore: true, // Will be updated if we implement unread pagination
                  isFetching: false,
                },
              };
            }

            set({
              hasInitialData: true,
              fetchedVisibilityFilters: fetchedFilters,
              viewPaginationState: paginationState,
            });
            break;
          }

          case "feed-items": {
            // Track the current view ID from the first feed-items chunk
            if (get().currentViewId === null) {
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

    revalidateView: async (viewId: number) => {
      for await (const chunk of (await orpcRouterClient.initial.revalidateView({
        viewId,
      })) as AsyncIterable<RevalidateViewChunk>) {
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
  useRevalidateView,
  useCurrentViewId,
  useViewFeedIds,
  useViewPaginationState,
  useFetchedVisibilityFilters,
  useFetchItemsForVisibility,
  useFetchItemsForAllViews,
  useFetchMoreItems,
  useGetPaginationState,
  useFeedPaginationState,
  useCategoryPaginationState,
  useFetchedFeedFilters,
  useFetchedCategoryFilters,
  useFetchItemsForFeed,
  useFetchItemsForCategory,
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
