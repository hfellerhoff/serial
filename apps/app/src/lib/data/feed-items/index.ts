import { useAtomValue } from "jotai";
import { useMemo } from "react";
import {
  categoryFilterAtom,
  feedFilterAtom,
  viewFilterAtom,
  visibilityFilterAtom,
} from "../atoms";
import {
  feedItemsStore,
  getFeedItemScopeKey,
  useFeedItemsListProjection,
} from "../store";
import { useFeedCategories } from "../feed-categories/store";
import { useCustomViewsData, useViews } from "../views";
import { getMixedScopeKey, mixedContentStore } from "../mixed-content/store";
import { bookmarksStore } from "../bookmarks/store";
import { projectLocalMixedContentOrder } from "../mixed-content/bookmarkProjection";
import {
  createFeedItemFilterIndex,
  createFeedItemFilterPredicate,
  getItemSectionPlacement,
} from "./listProjection";
import type { VisibilityFilter } from "../atoms";
import type { ApplicationFeedItem, ApplicationView } from "~/server/db/schema";
import type { FeedItemFilterIndex } from "./listProjection";
import type { PaginationCursor } from "~/server/api/routers/initialRouter";
import {
  compareSavedOrderCoordinates,
  sortFeedItemsOrderByDate,
  sortFeedItemsOrderBySavedAt,
  sortFeedItemsOrderBySectionThenDate,
  sortFeedItemsOrderBySectionThenSavedAt,
  sortFeedItemsOrderByWatchedAt,
} from "~/lib/sortFeedItems";

export { isFeedCompatibleWithContentFilter } from "./filters";
export {
  createFeedItemFilterIndex,
  createFeedItemFilterPredicate,
  getItemSectionPlacement,
  hasFeedItemListProjectionChanged,
} from "./listProjection";
export { mergeFeedItem } from "./mergeFeedItem";

function isItemOlderThanCursor(
  item: ApplicationFeedItem,
  cursor: PaginationCursor,
  visibilityFilter: VisibilityFilter,
  sectionPlacement?: number,
): boolean {
  if (!cursor) return false;

  // Sectioned views are ordered by placement asc, then postedAt/id desc.
  if (cursor.placement !== undefined && sectionPlacement !== undefined) {
    if (sectionPlacement > cursor.placement) {
      return true;
    }
    if (sectionPlacement < cursor.placement) {
      return false;
    }
  }

  if (visibilityFilter === "later") {
    return compareSavedOrderCoordinates(item, cursor) > 0;
  }

  // For read visibility, the server sorts by isWatchedUpdatedAt first.
  if (cursor.isWatchedUpdatedAt) {
    const itemWatchedTime = item.isWatchedUpdatedAt?.getTime() ?? 0;
    const cursorWatchedTime = cursor.isWatchedUpdatedAt.getTime();

    if (itemWatchedTime < cursorWatchedTime) {
      return true;
    }
    if (itemWatchedTime === cursorWatchedTime) {
      const itemTime = item.postedAt.getTime();
      const cursorTime = cursor.postedAt.getTime();

      if (itemTime < cursorTime) {
        return true;
      }
      if (itemTime === cursorTime && item.id < cursor.id) {
        return true;
      }
    }
    return false;
  }

  const itemTime = item.postedAt.getTime();
  const cursorTime = cursor.postedAt.getTime();

  if (itemTime < cursorTime) {
    return true;
  }
  if (itemTime === cursorTime && item.id < cursor.id) {
    return true;
  }
  return false;
}

function getActiveFeedItemsSort({
  feedItemsDict,
  visibilityFilter,
  feedFilter,
  categoryFilter,
  viewFilter,
  filterIndex,
}: {
  feedItemsDict: Record<string, ApplicationFeedItem>;
  visibilityFilter: VisibilityFilter;
  feedFilter: number;
  categoryFilter: number;
  viewFilter: ApplicationView | null;
  filterIndex: FeedItemFilterIndex;
}) {
  if (visibilityFilter === "read") {
    return sortFeedItemsOrderByWatchedAt(feedItemsDict);
  }

  const isFeedOrCategoryScoped = feedFilter >= 0 || categoryFilter >= 0;
  if (isFeedOrCategoryScoped || !viewFilter?.viewSections?.length) {
    return visibilityFilter === "later"
      ? sortFeedItemsOrderBySavedAt(feedItemsDict)
      : sortFeedItemsOrderByDate(feedItemsDict);
  }

  return visibilityFilter === "later"
    ? sortFeedItemsOrderBySectionThenSavedAt(
        feedItemsDict,
        viewFilter.viewSections,
        filterIndex,
      )
    : sortFeedItemsOrderBySectionThenDate(
        feedItemsDict,
        viewFilter.viewSections,
        filterIndex,
      );
}

export const useFilteredFeedItemsOrder = () => {
  const visibilityFilter = useAtomValue(visibilityFilterAtom);
  const categoryFilter = useAtomValue(categoryFilterAtom);
  const feedItemsOrder = feedItemsStore.useFeedItemsOrder();
  const feedItemsProjection = useFeedItemsListProjection();
  const scopeFeedItemIds = feedItemsStore.useScopeFeedItemIds();
  const feedCategories = useFeedCategories();
  const feedFilter = useAtomValue(feedFilterAtom);
  const viewFilter = useAtomValue(viewFilterAtom);
  const { customViews } = useCustomViewsData();
  const filterIndex = useMemo(
    () =>
      createFeedItemFilterIndex(
        feedCategories,
        viewFilter && !customViews.some((view) => view.id === viewFilter.id)
          ? [...customViews, viewFilter]
          : customViews,
      ),
    [feedCategories, customViews, viewFilter],
  );

  // Get pagination states for cursor-based filtering
  const viewPaginationState = feedItemsStore.useViewPaginationState();
  const feedPaginationState = feedItemsStore.useFeedPaginationState();
  const categoryPaginationState = feedItemsStore.useCategoryPaginationState();

  // Determine active cursor based on filter priority: feed > category > view
  const activeCursor: PaginationCursor | undefined = (() => {
    if (feedFilter >= 0) {
      return feedPaginationState[feedFilter]?.[visibilityFilter]?.cursor;
    }
    if (categoryFilter >= 0) {
      return categoryPaginationState[categoryFilter]?.[visibilityFilter]
        ?.cursor;
    }
    if (viewFilter?.id) {
      return viewPaginationState[viewFilter.id]?.[visibilityFilter]?.cursor;
    }
    return undefined;
  })();

  const activeScopeKey: string | undefined = (() => {
    if (feedFilter >= 0) {
      return getFeedItemScopeKey("feed", feedFilter, visibilityFilter);
    }
    if (categoryFilter >= 0) {
      return getFeedItemScopeKey("category", categoryFilter, visibilityFilter);
    }
    if (viewFilter?.id) {
      return getFeedItemScopeKey("view", viewFilter.id, visibilityFilter);
    }
    return undefined;
  })();
  const scopedFeedItemsOrder = activeScopeKey
    ? scopeFeedItemIds[activeScopeKey]
    : undefined;

  return useMemo(() => {
    const feedItemsDict = feedItemsProjection.getItems();
    const baseFeedItemsOrder = scopedFeedItemsOrder ?? feedItemsOrder;
    const shouldApplyCursorFilter = scopedFeedItemsOrder === undefined;
    const doesFeedItemPassFilters = createFeedItemFilterPredicate({
      visibilityFilter,
      categoryFilter,
      feedFilter,
      viewFilter,
      filterIndex,
    });

    const filteredFeedItemsOrder = baseFeedItemsOrder.filter((id) => {
      const item = feedItemsDict[id];
      if (!item) return false;

      // Apply cursor filter - hide items older than cursor
      const itemSectionPlacement = getItemSectionPlacement(
        item,
        viewFilter,
        filterIndex,
      );

      if (
        shouldApplyCursorFilter &&
        activeCursor &&
        isItemOlderThanCursor(
          item,
          activeCursor,
          visibilityFilter,
          itemSectionPlacement,
        )
      ) {
        return false;
      }

      return doesFeedItemPassFilters(item);
    });

    return filteredFeedItemsOrder.sort(
      getActiveFeedItemsSort({
        feedItemsDict,
        visibilityFilter,
        feedFilter,
        categoryFilter,
        viewFilter,
        filterIndex,
      }),
    );
  }, [
    activeCursor,
    categoryFilter,
    feedFilter,
    feedItemsProjection,
    feedItemsOrder,
    filterIndex,
    scopedFeedItemsOrder,
    viewFilter,
    visibilityFilter,
  ]);
};

export const useFilteredContentOrder = () => {
  const feedItemsOrder = useFilteredFeedItemsOrder();
  const feedItemsProjection = useFeedItemsListProjection();
  const feedCategories = useFeedCategories();
  const visibilityFilter = useAtomValue(visibilityFilterAtom);
  const categoryFilter = useAtomValue(categoryFilterAtom);
  const feedFilter = useAtomValue(feedFilterAtom);
  const viewFilter = useAtomValue(viewFilterAtom);
  const mixedScopes = mixedContentStore.useScopes();
  const { views } = useViews();
  const bookmarkRevision = bookmarksStore.useRevision();
  const bookmarks = useMemo(() => {
    void bookmarkRevision;
    return { ...bookmarksStore.getState().snapshot() };
  }, [bookmarkRevision]);

  return useMemo(() => {
    if (feedFilter >= 0) return feedItemsOrder;
    const scope =
      categoryFilter >= 0
        ? ({ type: "tag", tagId: categoryFilter } as const)
        : viewFilter
          ? ({ type: "view", viewId: viewFilter.id } as const)
          : null;
    if (!scope) return feedItemsOrder;
    const loadedScope = mixedScopes[getMixedScopeKey(scope, visibilityFilter)];
    if (loadedScope) {
      return loadedScope.references.map((reference) => reference.entityId);
    }
    return projectLocalMixedContentOrder({
      feedItemIds: feedItemsOrder,
      feedItems: feedItemsProjection.getItems(),
      bookmarks,
      scope,
      views,
      visibility: visibilityFilter,
      feedCategories,
    });
  }, [
    bookmarks,
    categoryFilter,
    feedFilter,
    feedItemsOrder,
    feedItemsProjection,
    feedCategories,
    mixedScopes,
    viewFilter,
    views,
    visibilityFilter,
  ]);
};
