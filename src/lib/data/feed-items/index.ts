import { useAtomValue } from "jotai";
import { useMemo } from "react";
import {
  categoryFilterAtom,
  feedFilterAtom,
  viewFilterAtom,
  visibilityFilterAtom,
} from "../atoms";
import { feedItemsStore, getFeedItemScopeKey } from "../store";
import { useFeedCategories } from "../feed-categories/store";
import { useCustomViewsData } from "../views";
import {
  doesFeedItemPassFilters,
  getItemSectionPlacement,
} from "./clientFilters";
import type { VisibilityFilter } from "../atoms";
import type {
  ApplicationFeedItem,
  ApplicationView,
  DatabaseFeedCategory,
} from "~/server/db/schema";
import type { PaginationCursor } from "~/server/api/routers/initialRouter";
import {
  sortFeedItemsOrderByDate,
  sortFeedItemsOrderBySectionThenDate,
  sortFeedItemsOrderByWatchedAt,
} from "~/lib/sortFeedItems";

export {
  getContentTypeFromItem,
  isFeedCompatibleWithContentType,
} from "./filters";
export {
  doesFeedItemPassFilters,
  getItemSectionPlacement,
} from "./clientFilters";
export { mergeFeedItem } from "./mergeFeedItem";

function isItemOlderThanCursor(
  item: ApplicationFeedItem,
  cursor: PaginationCursor,
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
  feedCategories,
}: {
  feedItemsDict: Record<string, ApplicationFeedItem>;
  visibilityFilter: VisibilityFilter;
  feedFilter: number;
  categoryFilter: number;
  viewFilter: ApplicationView | null;
  feedCategories: DatabaseFeedCategory[];
}) {
  if (visibilityFilter === "read") {
    return sortFeedItemsOrderByWatchedAt(feedItemsDict);
  }

  const isFeedOrCategoryScoped = feedFilter >= 0 || categoryFilter >= 0;
  if (isFeedOrCategoryScoped || !viewFilter?.viewSections?.length) {
    return sortFeedItemsOrderByDate(feedItemsDict);
  }

  return sortFeedItemsOrderBySectionThenDate(
    feedItemsDict,
    viewFilter.viewSections,
    feedCategories,
  );
}

export const useFilteredFeedItemsOrder = () => {
  const visibilityFilter = useAtomValue(visibilityFilterAtom);
  const categoryFilter = useAtomValue(categoryFilterAtom);
  const feedItemsOrder = feedItemsStore.useFeedItemsOrder();
  const feedItemsDict = feedItemsStore.useFeedItemsDict();
  const scopeFeedItemIds = feedItemsStore.useScopeFeedItemIds();
  const feedCategories = useFeedCategories();
  const feedFilter = useAtomValue(feedFilterAtom);
  const viewFilter = useAtomValue(viewFilterAtom);
  const { customViews, customViewCategoryIds, customViewFeedIds } =
    useCustomViewsData();

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
    const baseFeedItemsOrder = scopedFeedItemsOrder ?? feedItemsOrder;
    const shouldApplyCursorFilter = scopedFeedItemsOrder === undefined;

    const filteredFeedItemsOrder = baseFeedItemsOrder.filter((id) => {
      const item = feedItemsDict[id];
      if (!item) return false;

      // Apply cursor filter - hide items older than cursor
      const itemSectionPlacement = getItemSectionPlacement(
        item,
        viewFilter,
        feedCategories,
      );

      if (
        shouldApplyCursorFilter &&
        activeCursor &&
        isItemOlderThanCursor(item, activeCursor, itemSectionPlacement)
      ) {
        return false;
      }

      return doesFeedItemPassFilters({
        item,
        visibilityFilter,
        categoryFilter,
        feedCategories,
        feedFilter,
        viewFilter,
        customViewCategoryIds,
        customViews,
        customViewFeedIds,
      });
    });

    return filteredFeedItemsOrder.sort(
      getActiveFeedItemsSort({
        feedItemsDict,
        visibilityFilter,
        feedFilter,
        categoryFilter,
        viewFilter,
        feedCategories,
      }),
    );
  }, [
    activeCursor,
    categoryFilter,
    customViewCategoryIds,
    customViewFeedIds,
    customViews,
    feedCategories,
    feedFilter,
    feedItemsDict,
    feedItemsOrder,
    scopedFeedItemsOrder,
    viewFilter,
    visibilityFilter,
  ]);
};

export function useDoesFeedItemMatchAllFilters(item: ApplicationFeedItem) {
  const visibilityFilter = useAtomValue(visibilityFilterAtom);
  const categoryFilter = useAtomValue(categoryFilterAtom);
  const feedCategories = useFeedCategories();
  const feedFilter = useAtomValue(feedFilterAtom);
  const viewFilter = useAtomValue(viewFilterAtom);
  const { customViews, customViewCategoryIds, customViewFeedIds } =
    useCustomViewsData();

  return doesFeedItemPassFilters({
    item,
    visibilityFilter,
    categoryFilter,
    feedCategories,
    feedFilter,
    viewFilter,
    customViewCategoryIds,
    customViews,
    customViewFeedIds,
  });
}
