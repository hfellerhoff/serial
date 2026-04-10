import { useAtomValue } from "jotai";
import {
  categoryFilterAtom,
  feedFilterAtom,
  softReadItemIdsAtom,
  viewFilterAtom,
  visibilityFilterAtom,
} from "../atoms";
import { feedItemsStore } from "../store";
import { useFeedCategories } from "../feed-categories/store";
import { INBOX_VIEW_ID, useCustomViewsData } from "../views";
import { isFeedCompatibleWithContentType } from "./filters";
import type { VisibilityFilter } from "../atoms";
import type {
  ApplicationFeedItem,
  ApplicationView,
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

export function doesFeedItemPassFilters({
  item,
  visibilityFilter,
  categoryFilter,
  feedCategories,
  feedFilter,
  viewFilter,
  customViewCategoryIds,
  customViews,
  softReadItemIds,
  customViewFeedIds,
}: {
  item: ApplicationFeedItem;
  visibilityFilter: VisibilityFilter;
  categoryFilter: number;
  feedCategories: DatabaseFeedCategory[];
  feedFilter: number;
  viewFilter: ApplicationView | null;
  customViewCategoryIds?: Set<number>;
  customViews?: ApplicationView[];
  softReadItemIds?: Set<string>;
  customViewFeedIds?: Set<number>;
}) {
  // Visibility filter
  if (visibilityFilter === "unread" && (item.isWatched || item.isWatchLater)) {
    // Allow soft read items to pass through unread filter
    if (!softReadItemIds?.has(item.id)) {
      return false;
    }
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

  const feedsForViewByCategory = feedCategories
    .filter((category) => viewFilter?.categoryIds.includes(category.categoryId))
    .map((category) => category.feedId);

  // Union category-based feeds with directly assigned feeds
  const directlyAssignedFeedIds = viewFilter?.feedIds ?? [];
  const feedsForView = [
    ...new Set([...feedsForViewByCategory, ...directlyAssignedFeedIds]),
  ];

  // View filter
  const doesFeedHaveAnyCategories = feedCategories.some(
    (category) => category.feedId === item.feedId,
  );

  // For Uncategorized view, exclude feeds that are in a custom view category
  // AND whose platform is compatible with that view's content type,
  // OR directly assigned to a custom view whose content type is compatible
  if (viewFilter?.id === INBOX_VIEW_ID) {
    const feedCategoriesForItem = feedCategories.filter(
      (fc) =>
        fc.feedId === item.feedId && customViewCategoryIds?.has(fc.categoryId),
    );

    // Check if this feed would appear in any custom view via categories
    const wouldAppearViaCategory = feedCategoriesForItem.some((fc) => {
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

    // Check if this feed would appear in any custom view via direct assignment.
    // We must check content-type compatibility here too — otherwise a feed
    // directly assigned to an incompatible view would be orphaned (hidden from
    // both that view and Inbox).
    const wouldAppearViaDirectAssignment =
      !!customViewFeedIds?.has(item.feedId) &&
      (customViews?.some(
        (v) =>
          v.feedIds.includes(item.feedId) &&
          isFeedCompatibleWithContentType(item.platform, v.contentType),
      ) ??
        true);

    if (wouldAppearViaCategory || wouldAppearViaDirectAssignment) {
      return false;
    }
    // Include uncategorized feeds in Uncategorized view
    if (!doesFeedHaveAnyCategories) {
      return true;
    }
  }

  if (
    !!viewFilter &&
    (viewFilter.categoryIds.length > 0 || viewFilter.feedIds.length > 0) &&
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
  const visibilityFilter = useAtomValue(visibilityFilterAtom);
  const categoryFilter = useAtomValue(categoryFilterAtom);
  const feedItemsOrder = feedItemsStore.useFeedItemsOrder();
  const feedItemsDict = feedItemsStore.useFeedItemsDict();
  const feedCategories = useFeedCategories();
  const feedFilter = useAtomValue(feedFilterAtom);
  const viewFilter = useAtomValue(viewFilterAtom);
  const { customViews, customViewCategoryIds, customViewFeedIds } =
    useCustomViewsData();
  const softReadItemIds = useAtomValue(softReadItemIdsAtom);

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

    return doesFeedItemPassFilters({
      item,
      visibilityFilter,
      categoryFilter,
      feedCategories,
      feedFilter,
      viewFilter,
      customViewCategoryIds,
      customViews,
      softReadItemIds,
      customViewFeedIds,
    });
  });
};

export function useDoesFeedItemMatchAllFilters(item: ApplicationFeedItem) {
  const visibilityFilter = useAtomValue(visibilityFilterAtom);
  const categoryFilter = useAtomValue(categoryFilterAtom);
  const feedCategories = useFeedCategories();
  const feedFilter = useAtomValue(feedFilterAtom);
  const viewFilter = useAtomValue(viewFilterAtom);
  const { customViews, customViewCategoryIds, customViewFeedIds } =
    useCustomViewsData();
  const softReadItemIds = useAtomValue(softReadItemIdsAtom);

  return doesFeedItemPassFilters({
    item,
    visibilityFilter,
    categoryFilter,
    feedCategories,
    feedFilter,
    viewFilter,
    customViewCategoryIds,
    customViews,
    softReadItemIds,
    customViewFeedIds,
  });
}
