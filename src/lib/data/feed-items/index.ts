import { useAtomValue } from "jotai";
import {
  categoryFilterAtom,
  dateFilterAtom,
  feedFilterAtom,
  viewFilterAtom,
  visibilityFilterAtom,
} from "../atoms";
import { feedItemsStore } from "../store";
import { useFeedCategories } from "../feed-categories/store";
import { useFeeds } from "../feeds/store";
import { INBOX_VIEW_ID, useCustomViewsData } from "../views";
import { isFeedCompatibleWithContentType } from "./filters";
import type { VisibilityFilter } from "../atoms";
import type {
  ApplicationFeedItem,
  ApplicationView,
  DatabaseFeed,
  DatabaseFeedCategory,
} from "~/server/db/schema";
import type { PaginationCursor } from "~/server/api/routers/initialRouter";

export { isFeedCompatibleWithContentType } from "./filters";

function isVideoContent(item: ApplicationFeedItem): boolean {
  const videoPlatforms = ["youtube", "peertube", "nebula"];
  return videoPlatforms.includes(item.platform);
}

function isItemOlderThanCursor(
  item: ApplicationFeedItem,
  cursor: PaginationCursor,
): boolean {
  if (!cursor) return false;

  const itemTime = item.postedAt.getTime();
  const cursorTime = cursor.postedAt.getTime();

  if (itemTime < cursorTime) {
    return true;
  }
  if (itemTime === cursorTime && item.id > cursor.id) {
    return true;
  }
  return false;
}

export function doesFeedItemPassFilters(
  item: ApplicationFeedItem,
  dateFilter: number,
  visibilityFilter: VisibilityFilter,
  categoryFilter: number,
  feedCategories: DatabaseFeedCategory[],
  feedFilter: number,
  feeds: DatabaseFeed[],
  viewFilter: ApplicationView | null,
  customViewCategoryIds?: Set<number>,
  customViews?: ApplicationView[],
) {
  // Visibility filter
  if (visibilityFilter === "unread" && (item.isWatched || item.isWatchLater)) {
    return false;
  }
  if (visibilityFilter === "read" && (!item.isWatched || item.isWatchLater)) {
    return false;
  }
  if (visibilityFilter === "later" && !item.isWatchLater) {
    return false;
  }

  // Category filter
  const feedIdsInCategory = feedCategories
    .filter((category) => category.categoryId === categoryFilter)
    .map((category) => category.feedId);
  if (categoryFilter >= 0 && !feedIdsInCategory.includes(item.feedId)) {
    return false;
  }

  // Feed filter
  if (feedFilter >= 0 && item.feedId !== feedFilter) {
    return false;
  }

  const feedsForView = feedCategories
    .filter((category) => viewFilter?.categoryIds.includes(category.categoryId))
    .map((category) => category.feedId);

  // View filter
  const doesFeedHaveAnyCategories = feedCategories.some(
    (category) => category.feedId === item.feedId,
  );

  // For Uncategorized view, exclude feeds that are in a custom view category
  // AND whose platform is compatible with that view's content type
  if (viewFilter?.id === INBOX_VIEW_ID) {
    const feedCategoriesForItem = feedCategories.filter(
      (fc) =>
        fc.feedId === item.feedId && customViewCategoryIds?.has(fc.categoryId),
    );

    // Check if this feed would appear in any custom view
    const wouldAppearInCustomView = feedCategoriesForItem.some((fc) => {
      if (!customViews) return true; // Fallback to old behavior if no views provided

      // Find views that include this category
      const viewsWithCategory = customViews.filter((v) =>
        v.categoryIds.includes(fc.categoryId),
      );

      // Check if any of those views would show this feed's content type
      return viewsWithCategory.some((v) =>
        isFeedCompatibleWithContentType(item.platform, v.contentType),
      );
    });

    if (wouldAppearInCustomView) {
      return false;
    }
    // Include uncategorized feeds in Uncategorized view
    if (!doesFeedHaveAnyCategories) {
      return true;
    }
  }

  if (
    !!viewFilter &&
    viewFilter.categoryIds.length > 0 &&
    !feedsForView.includes(item.feedId)
  ) {
    return false;
  }

  // Content type filter (from view)
  if (viewFilter?.contentType) {
    const ct = viewFilter.contentType;
    if (ct === "longform" && item.orientation === "vertical") {
      return false;
    }
    if (ct === "horizontal-video") {
      // Must be video content AND horizontal orientation
      if (!isVideoContent(item) || item.orientation !== "horizontal") {
        return false;
      }
    }
    if (ct === "vertical-video") {
      // Must be video content AND vertical orientation
      if (!isVideoContent(item) || item.orientation !== "vertical") {
        return false;
      }
    }
    // "all" passes through
  }

  // Time window filter (from view)
  // 0 means "All time", so skip filtering
  if (viewFilter?.daysWindow && viewFilter.daysWindow > 0) {
    const now = new Date();
    const cutoffDate = new Date(now);
    cutoffDate.setDate(cutoffDate.getDate() - viewFilter.daysWindow);

    if (item.postedAt < cutoffDate) {
      return false;
    }
  }

  return true;
}

export const useFilteredFeedItemsOrder = () => {
  const dateFilter = useAtomValue(dateFilterAtom);
  const visibilityFilter = useAtomValue(visibilityFilterAtom);
  const categoryFilter = useAtomValue(categoryFilterAtom);
  const feedItemsOrder = feedItemsStore.useFeedItemsOrder();
  const feedItemsDict = feedItemsStore.useFeedItemsDict();
  const feedCategories = useFeedCategories();
  const feedFilter = useAtomValue(feedFilterAtom);
  const feeds = useFeeds();
  const viewFilter = useAtomValue(viewFilterAtom);
  const { customViews, customViewCategoryIds } = useCustomViewsData();

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

  return feedItemsOrder.filter((id) => {
    const item = feedItemsDict[id];
    if (!item) return false;

    // Apply cursor filter - hide items older than cursor
    if (activeCursor && isItemOlderThanCursor(item, activeCursor)) {
      return false;
    }

    return doesFeedItemPassFilters(
      item,
      dateFilter,
      visibilityFilter,
      categoryFilter,
      feedCategories,
      feedFilter,
      feeds,
      viewFilter,
      customViewCategoryIds,
      customViews,
    );
  });
};

export function useDoesFeedItemMatchAllFilters(item: ApplicationFeedItem) {
  const dateFilter = useAtomValue(dateFilterAtom);
  const visibilityFilter = useAtomValue(visibilityFilterAtom);
  const categoryFilter = useAtomValue(categoryFilterAtom);
  const feedCategories = useFeedCategories();
  const feedFilter = useAtomValue(feedFilterAtom);
  const feeds = useFeeds();
  const viewFilter = useAtomValue(viewFilterAtom);
  const { customViews, customViewCategoryIds } = useCustomViewsData();

  return doesFeedItemPassFilters(
    item,
    dateFilter,
    visibilityFilter,
    categoryFilter,
    feedCategories,
    feedFilter,
    feeds,
    viewFilter,
    customViewCategoryIds,
    customViews,
  );
}
