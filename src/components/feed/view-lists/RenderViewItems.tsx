"use client";

import { useAtomValue } from "jotai";
import { EmptyState, FeedEmptyState } from "./EmptyStates";
import {
  GridSkeleton,
  LargeGridSkeleton,
  LargeListSkeleton,
  StandardListSkeleton,
} from "./skeletons";
import { ViewItemGrid } from "./ViewItemGrid";
import { ViewItemLargeGrid } from "./ViewItemLargeGrid";
import { ViewItemLargeList } from "./ViewItemLargeList";
import { ViewItemStandardList } from "./ViewItemStandardList";
import FeedLoading from "~/components/loading";
import { viewFilterAtom } from "~/lib/data/atoms";
import { useFeedCategories } from "~/lib/data/feed-categories";
import { useFilteredFeedItemsOrder } from "~/lib/data/feed-items";
import { useFeeds } from "~/lib/data/feeds";
import {
  useFetchFeedItemsLastFetchedAt,
  useHasInitialData,
} from "~/lib/data/store";
import { INBOX_VIEW_ID } from "~/lib/data/views/constants";
import { VIEW_LAYOUT, viewLayoutSchema } from "~/server/db/constants";
import { useFeedItemNavigation } from "~/lib/hooks/useFeedItemNavigation";

export function RenderViewItems() {
  const { feeds, hasFetchedFeeds } = useFeeds();
  const { hasFetchedFeedCategories } = useFeedCategories();

  const feedItemsLastFetchedAt = useFetchFeedItemsLastFetchedAt();
  const hasInitialData = useHasInitialData();

  const filteredFeedItemsOrder = useFilteredFeedItemsOrder();

  const currentView = useAtomValue(viewFilterAtom);
  const isUncategorized = currentView?.id === INBOX_VIEW_ID;

  const parsedLayout = viewLayoutSchema.safeParse(currentView?.layout);
  const layout =
    isUncategorized || !parsedLayout.success
      ? VIEW_LAYOUT.LIST
      : parsedLayout.data;

  const isGridLayout =
    layout === VIEW_LAYOUT.GRID || layout === VIEW_LAYOUT.LARGE_GRID;

  // Keyboard navigation
  const { handleMouseSelect } = useFeedItemNavigation(
    filteredFeedItemsOrder,
    isGridLayout,
  );

  if (!hasInitialData) {
    return <FeedLoading />;
  }

  if (hasFetchedFeeds && !feeds.length) {
    return <FeedEmptyState />;
  }

  // Show skeletons while feed items are being fetched
  if (feedItemsLastFetchedAt === null && filteredFeedItemsOrder.length === 0) {
    switch (layout) {
      case VIEW_LAYOUT.LARGE_LIST:
        return <LargeListSkeleton />;
      case VIEW_LAYOUT.GRID:
        return <GridSkeleton />;
      case VIEW_LAYOUT.LARGE_GRID:
        return <LargeGridSkeleton />;
      default:
        return <StandardListSkeleton />;
    }
  }

  if (
    hasFetchedFeeds &&
    feedItemsLastFetchedAt !== null &&
    hasFetchedFeedCategories &&
    !filteredFeedItemsOrder.length
  ) {
    return <EmptyState />;
  }

  switch (layout) {
    case VIEW_LAYOUT.LARGE_LIST:
      return (
        <ViewItemLargeList
          items={filteredFeedItemsOrder}
          handleMouseSelect={handleMouseSelect}
        />
      );
    case VIEW_LAYOUT.GRID:
      return (
        <ViewItemGrid
          items={filteredFeedItemsOrder}
          handleMouseSelect={handleMouseSelect}
        />
      );
    case VIEW_LAYOUT.LARGE_GRID:
      return (
        <ViewItemLargeGrid
          items={filteredFeedItemsOrder}
          handleMouseSelect={handleMouseSelect}
        />
      );
    default:
      return (
        <ViewItemStandardList
          items={filteredFeedItemsOrder}
          handleMouseSelect={handleMouseSelect}
        />
      );
  }
}
