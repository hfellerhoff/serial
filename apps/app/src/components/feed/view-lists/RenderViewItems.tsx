"use client";

import { useAtomValue } from "jotai";
import { CheckIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { EmptyState, FeedEmptyState } from "./EmptyStates";
import { PaginationEnd } from "./PaginationEnd";
import { PaginationLoader } from "./PaginationLoader";
import {
  GridSkeleton,
  LargeGridSkeleton,
  LargeListSkeleton,
  StandardListSkeleton,
} from "./skeletons";
import { useViewListScroll } from "./useViewListScroll";
import { useViewSections } from "./useViewSections";
import { ViewItemGrid } from "./ViewItemGrid";
import { ViewItemLargeGrid } from "./ViewItemLargeGrid";
import { ViewItemLargeList } from "./ViewItemLargeList";
import { ViewItemStandardList } from "./ViewItemStandardList";
import type { ViewSection } from "./useViewSections";
import { ButtonWithShortcut } from "~/components/ButtonWithShortcut";
import FeedLoading from "~/components/loading";
import { SHORTCUT_KEYS } from "~/lib/constants/shortcuts";
import {
  selectedItemIdAtom,
  viewFilterAtom,
  visibilityFilterAtom,
} from "~/lib/data/atoms";
import { bookmarksStore } from "~/lib/data/bookmarks/store";
import { useFeedCategories } from "~/lib/data/feed-categories";
import { useFilteredContentOrder } from "~/lib/data/feed-items";
import { useFeeds } from "~/lib/data/feeds";
import { setMixedReadValue } from "~/lib/data/mixed-content/mutations";
import {
  useFetchFeedItemsLastFetchedAt,
  useHasInitialData,
} from "~/lib/data/store";
import { useFeedItemNavigation } from "~/lib/hooks/useFeedItemNavigation";
import { useLazyCategoryFilter } from "~/lib/hooks/useLazyCategoryFilter";
import { useLazyFeedFilter } from "~/lib/hooks/useLazyFeedFilter";
import { useShortcut } from "~/lib/hooks/useShortcut";
import { useValidateViewItems } from "~/lib/hooks/useValidateViewItems";
import { REMOTE_IMAGE_PROPS } from "~/lib/remoteMedia";
import { showUndoToast } from "~/lib/undo";
import { VIEW_LAYOUT } from "~/server/db/constants";

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
        {...REMOTE_IMAGE_PROPS}
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
  const [isLoading, setIsLoading] = useState(false);
  const [isStuck, setIsStuck] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

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
      const references = sectionItems.map((entityId) => ({
        entityId,
        entityKind: bookmarksStore.getState().getBookmark(entityId)
          ? ("bookmark" as const)
          : ("feed-item" as const),
        sectionPlacement: null,
        normalizedAt: new Date(0),
      }));

      await setMixedReadValue({ references, isRead: true });

      onMarkAsRead?.(sectionIndex);

      showUndoToast({
        message: `Marked ${references.length} item${references.length === 1 ? "" : "s"} as read`,
        onUndo: async () => {
          await setMixedReadValue({ references, isRead: false });
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
  sectionItemsForAction,
}: {
  section: ViewSection;
  handleMouseSelect: (itemId: string) => void;
  sectionIndex: number;
  onMarkAsRead?: (sectionIndex: number) => void;
  sectionItemsForAction: string[];
}) {
  const { items, layout, name, itemType, itemId } = section;

  const layoutProps = {
    items,
    handleMouseSelect,
    sectionItemType: itemType,
  };

  return (
    <div className="w-full" id={`section-${sectionIndex}`}>
      {items.length > 0 && (
        <SectionHeading
          name={name}
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

export function RenderViewItems() {
  useLazyFeedFilter();
  useLazyCategoryFilter();
  useValidateViewItems();

  const { feeds, hasFetchedFeeds } = useFeeds();
  const { hasFetchedFeedCategories } = useFeedCategories();

  const feedItemsLastFetchedAt = useFetchFeedItemsLastFetchedAt();
  const hasInitialData = useHasInitialData();

  const filteredFeedItemsOrder = useFilteredContentOrder();

  const currentView = useAtomValue(viewFilterAtom);
  const {
    sentinelRef,
    paginationState,
    visibleItems: visibleFilteredFeedItemsOrder,
    hasRenderedAllItems,
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
  const viewListKey = `view-${currentView?.id ?? "none"}-${visibilityFilter}`;
  const navigationItems = fullFlatItems;
  const navigationIsGridLayout =
    fullSectionInfo.length === 1 && fullHasGridSections;
  const navigationSectionInfo = fullSectionInfo;
  const shouldShowPaginationEnd =
    hasRenderedAllItems &&
    paginationState?.hasMore === false &&
    paginationState.isFetching !== true;

  // Keyboard navigation
  const { handleMouseSelect, selectItem } = useFeedItemNavigation(
    navigationItems,
    navigationIsGridLayout,
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

  if (
    hasFetchedFeeds &&
    !feeds.length &&
    Object.keys(bookmarksStore.getState().snapshot()).length === 0
  ) {
    return <FeedEmptyState />;
  }

  // Show skeletons while feed items are being fetched
  if (
    (feedItemsLastFetchedAt === null || paginationState?.isFetching) &&
    filteredFeedItemsOrder.length === 0
  ) {
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
      {visibleComputedSections.map((section, index) => {
        return (
          <LayoutSection
            key={
              section.isUncategorized
                ? `${viewListKey}-uncategorized`
                : `${viewListKey}-${section.itemType}-${section.itemId}`
            }
            section={section}
            sectionIndex={index}
            handleMouseSelect={handleMouseSelect}
            onMarkAsRead={handleSectionMarkAsRead}
            sectionItemsForAction={fullComputedSections[index]?.items ?? []}
          />
        );
      })}
      <div ref={sentinelRef} className="h-px w-full" />
      {paginationState?.isFetching && <PaginationLoader />}
      {shouldShowPaginationEnd && <PaginationEnd />}
    </div>
  );
}
