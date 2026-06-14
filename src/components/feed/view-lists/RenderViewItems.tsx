"use client";

import { useAtomValue } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckIcon } from "lucide-react";
import { EmptyState, FeedEmptyState } from "./EmptyStates";
import { PaginationEnd } from "./PaginationEnd";
import { PaginationLoader } from "./PaginationLoader";
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
import { useViewSections } from "./useViewSections";
import { useViewListScroll } from "./useViewListScroll";
import type { ViewSection } from "./useViewSections";
import type { ViewLayout } from "~/server/db/constants";
import { VIEW_LAYOUT } from "~/server/db/constants";
import FeedLoading from "~/components/loading";
import { ButtonWithShortcut } from "~/components/ButtonWithShortcut";
import { SHORTCUT_KEYS } from "~/lib/constants/shortcuts";
import { useLazyCategoryFilter } from "~/lib/hooks/useLazyCategoryFilter";
import { useLazyFeedFilter } from "~/lib/hooks/useLazyFeedFilter";
import { useValidateViewItems } from "~/lib/hooks/useValidateViewItems";
import {
  selectedItemIdAtom,
  viewFilterAtom,
  visibilityFilterAtom,
} from "~/lib/data/atoms";
import { useFeedCategories } from "~/lib/data/feed-categories";
import { useFeeds } from "~/lib/data/feeds";
import { useFilteredFeedItemsOrder } from "~/lib/data/feed-items";
import {
  setBulkWatchedValue,
  useBulkSetWatchedValueMutation,
} from "~/lib/data/feed-items/mutations";
import {
  feedItemsStore,
  useFetchFeedItemsLastFetchedAt,
  useHasInitialData,
} from "~/lib/data/store";
import { useFeedItemNavigation } from "~/lib/hooks/useFeedItemNavigation";
import { useShortcut } from "~/lib/hooks/useShortcut";
import { showUndoToast } from "~/lib/undo";

function getNextAvailableItemAfterSection(
  sectionIndex: number,
  sections: ViewSection[],
) {
  for (let i = sectionIndex + 1; i < sections.length; i++) {
    const nextSectionFirstItem = sections[i]?.items[0];
    if (nextSectionFirstItem) return nextSectionFirstItem;
  }

  for (let i = sectionIndex - 1; i >= 0; i--) {
    const previousSectionItems = sections[i]?.items;
    const previousSectionLastItem =
      previousSectionItems?.[previousSectionItems.length - 1];
    if (previousSectionLastItem) return previousSectionLastItem;
  }

  return null;
}

function SectionFeedIcon({ itemId }: { itemId?: number }) {
  const { feeds } = useFeeds();

  if (itemId === undefined) return null;

  const feed = feeds.find((candidateFeed) => candidateFeed.id === itemId);

  if (feed?.imageUrl) {
    return (
      <img
        src={feed.imageUrl}
        alt={feed.name}
        className="h-6 w-6 shrink-0 rounded object-contain"
      />
    );
  }

  return <div className="bg-muted-foreground/20 h-6 w-6 shrink-0 rounded" />;
}

function SectionHeading({
  name,
  itemType,
  itemId,
  sectionItems,
  sectionIndex,
  onMarkAsRead,
}: {
  name: string;
  itemType?: "feed" | "tag";
  itemId?: number;
  sectionItems: string[];
  sectionIndex: number;
  onMarkAsRead?: (sectionIndex: number) => void;
}) {
  const visibilityFilter = useAtomValue(visibilityFilterAtom);
  const selectedItemId = useAtomValue(selectedItemIdAtom);
  const feedItemsDict = feedItemsStore.useFeedItemsDict();
  const [isLoading, setIsLoading] = useState(false);
  const [isStuck, setIsStuck] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const bulkMutation = useBulkSetWatchedValueMutation();

  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsStuck(!entry?.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, []);

  const handleMarkSectionAsRead = async () => {
    if (visibilityFilter !== "unread" || sectionItems.length === 0) return;

    setIsLoading(true);
    try {
      const items = sectionItems
        .map((id) => ({
          id,
          feedId: feedItemsDict[id]?.feedId ?? 0,
        }))
        .filter((item) => item.feedId > 0);

      if (items.length === 0) return;

      await bulkMutation.mutateAsync({ items, isWatched: true });

      onMarkAsRead?.(sectionIndex);

      showUndoToast({
        message: `Marked ${items.length} item${items.length === 1 ? "" : "s"} as read`,
        onUndo: async () => {
          await setBulkWatchedValue({ items, isWatched: false });
        },
      });
    } finally {
      setIsLoading(false);
    }
  };

  const isSelectedItemInSection =
    selectedItemId !== null && sectionItems.includes(selectedItemId);

  useShortcut(SHORTCUT_KEYS.MARK_SECTION_READ, () => {
    if (!isSelectedItemInSection) return;

    void handleMarkSectionAsRead();
  });

  return (
    <>
      <div ref={sentinelRef} />
      <div
        className={`bg-background sticky top-0 z-30 border-b pb-2 transition-[border-color] ${
          isStuck ? "border-border" : "border-transparent"
        } ${sectionIndex === 0 ? "pt-4" : "pt-8"}`}
      >
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-6">
          {itemType === "feed" && <SectionFeedIcon itemId={itemId} />}
          {itemType === "tag" && (
            <div className="bg-muted text-muted-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs font-medium">
              #
            </div>
          )}
          <h2 className="line-clamp-1 text-lg font-semibold">{name}</h2>
          <div className="flex-1" />
          {visibilityFilter === "unread" && sectionItems.length > 0 && (
            <ButtonWithShortcut
              variant="outline"
              size="sm"
              onClick={handleMarkSectionAsRead}
              disabled={isLoading}
              className="gap-1.5 text-xs"
              shortcut={SHORTCUT_KEYS.MARK_SECTION_READ}
            >
              <CheckIcon size={14} />
              Mark as read
            </ButtonWithShortcut>
          )}
        </div>
      </div>
    </>
  );
}

function LayoutSection({
  section,
  handleMouseSelect,
  sectionIndex,
  onMarkAsRead,
  viewName,
  sectionItemsForAction,
  disableAutoAnimate,
}: {
  section: ViewSection;
  handleMouseSelect: (itemId: string) => void;
  sectionIndex: number;
  onMarkAsRead?: (sectionIndex: number) => void;
  viewName?: string;
  sectionItemsForAction: string[];
  disableAutoAnimate?: boolean;
}) {
  const { items, layout, name, isUncategorized, itemType, itemId } = section;
  const sectionName = isUncategorized ? (viewName ?? name) : name;

  const layoutProps = {
    items,
    handleMouseSelect,
    sectionItemType: itemType,
    disableAutoAnimate,
  };

  return (
    <div className="w-full" id={`section-${sectionIndex}`}>
      {items.length > 0 && (
        <SectionHeading
          name={sectionName}
          itemType={itemType}
          itemId={itemId}
          sectionItems={sectionItemsForAction}
          sectionIndex={sectionIndex}
          onMarkAsRead={onMarkAsRead}
        />
      )}
      {items.length > 0 && (
        <>
          {layout === VIEW_LAYOUT.LARGE_LIST && (
            <ViewItemLargeList {...layoutProps} />
          )}
          {layout === VIEW_LAYOUT.GRID && <ViewItemGrid {...layoutProps} />}
          {layout === VIEW_LAYOUT.LARGE_GRID && (
            <ViewItemLargeGrid {...layoutProps} />
          )}
          {layout === VIEW_LAYOUT.LIST && (
            <ViewItemStandardList {...layoutProps} />
          )}
        </>
      )}
    </div>
  );
}

function isGridLayout(layout: ViewLayout) {
  return layout === VIEW_LAYOUT.GRID || layout === VIEW_LAYOUT.LARGE_GRID;
}

function FlatViewItemsList({
  items,
  layout,
  handleMouseSelect,
  disableAutoAnimate,
}: {
  items: string[];
  layout: ViewLayout;
  handleMouseSelect: (itemId: string) => void;
  disableAutoAnimate?: boolean;
}) {
  const layoutProps = {
    items,
    handleMouseSelect,
    disableAutoAnimate,
  };

  if (layout === VIEW_LAYOUT.LARGE_LIST) {
    return <ViewItemLargeList {...layoutProps} />;
  }

  if (layout === VIEW_LAYOUT.GRID) {
    return <ViewItemGrid {...layoutProps} />;
  }

  if (layout === VIEW_LAYOUT.LARGE_GRID) {
    return <ViewItemLargeGrid {...layoutProps} />;
  }

  return <ViewItemStandardList {...layoutProps} />;
}

export function RenderViewItems() {
  useLazyFeedFilter();
  useLazyCategoryFilter();
  useValidateViewItems();

  const { feeds, hasFetchedFeeds } = useFeeds();
  const { hasFetchedFeedCategories } = useFeedCategories();

  const feedItemsLastFetchedAt = useFetchFeedItemsLastFetchedAt();
  const hasInitialData = useHasInitialData();

  const filteredFeedItemsOrder = useFilteredFeedItemsOrder();

  const currentView = useAtomValue(viewFilterAtom);
  const {
    sentinelRef,
    paginationState,
    visibleItems: visibleFilteredFeedItemsOrder,
    hasRenderedAllItems,
    isAutoAnimatePausedForPagination,
  } = useViewListScroll(filteredFeedItemsOrder);

  const {
    computedSections: fullComputedSections,
    flatItems: fullFlatItems,
    hasGridSections: fullHasGridSections,
    sectionInfo: fullSectionInfo,
    baseLayout,
  } = useViewSections(currentView, filteredFeedItemsOrder);
  const { computedSections: visibleComputedSections } = useViewSections(
    currentView,
    visibleFilteredFeedItemsOrder,
  );
  const visibilityFilter = useAtomValue(visibilityFilterAtom);
  const isReadVisibility = visibilityFilter === "read";
  const viewListKey = `view-${currentView?.id ?? "none"}-${visibilityFilter}`;
  const navigationItems = isReadVisibility
    ? filteredFeedItemsOrder
    : fullFlatItems;
  const navigationHasGridSections = isReadVisibility
    ? isGridLayout(baseLayout)
    : fullHasGridSections;
  const navigationSectionInfo = isReadVisibility ? undefined : fullSectionInfo;
  const shouldShowPaginationEnd =
    hasRenderedAllItems &&
    paginationState?.hasMore === false &&
    paginationState.isFetching !== true;

  // Keyboard navigation
  const { handleMouseSelect, selectItem } = useFeedItemNavigation(
    navigationItems,
    navigationHasGridSections,
    navigationSectionInfo,
  );

  const handleSectionMarkAsRead = useCallback(
    (sectionIndex: number) => {
      const nextItemId = getNextAvailableItemAfterSection(
        sectionIndex,
        fullComputedSections,
      );

      requestAnimationFrame(() => {
        requestAnimationFrame(() => selectItem(nextItemId));
      });
    },
    [fullComputedSections, selectItem],
  );

  if (!hasInitialData) {
    return <FeedLoading />;
  }

  if (hasFetchedFeeds && !feeds.length) {
    return <FeedEmptyState />;
  }

  // Show skeletons while feed items are being fetched
  if (feedItemsLastFetchedAt === null && filteredFeedItemsOrder.length === 0) {
    switch (baseLayout) {
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

  return (
    <div className="w-full">
      {isReadVisibility ? (
        <FlatViewItemsList
          key={viewListKey}
          items={visibleFilteredFeedItemsOrder}
          layout={baseLayout}
          handleMouseSelect={handleMouseSelect}
          disableAutoAnimate={isAutoAnimatePausedForPagination}
        />
      ) : (
        visibleComputedSections.map((section, index) => (
          <LayoutSection
            key={
              section.isUncategorized
                ? `${viewListKey}-uncategorized`
                : `${viewListKey}-${section.name}-${index}`
            }
            section={section}
            sectionIndex={index}
            handleMouseSelect={handleMouseSelect}
            onMarkAsRead={handleSectionMarkAsRead}
            viewName={currentView?.name}
            sectionItemsForAction={fullComputedSections[index]?.items ?? []}
            disableAutoAnimate={isAutoAnimatePausedForPagination}
          />
        ))
      )}
      <div ref={sentinelRef} className="h-px w-full" />
      {paginationState?.isFetching && <PaginationLoader />}
      {shouldShowPaginationEnd && <PaginationEnd />}
    </div>
  );
}
