"use client";

import { useAtomValue, useSetAtom } from "jotai";
import { CheckIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { buildContentStatusKey, isInboxUnread } from "~/lib/content-status";
import { SHORTCUT_KEYS } from "~/lib/constants/shortcuts";
import {
  categoryFilterAtom,
  contentStatusFilterAtom,
  feedFilterAtom,
  selectedItemIdAtom,
  viewFilterAtom,
} from "~/lib/data/atoms";
import { bookmarksStore } from "~/lib/data/bookmarks/store";
import { useFeedCategories } from "~/lib/data/feed-categories";
import { useFilteredContentOrder } from "~/lib/data/feed-items";
import { useFeeds } from "~/lib/data/feeds";
import { setMixedReadValue } from "~/lib/data/mixed-content/mutations";
import { useCanMutate } from "~/lib/data/offline-mutations";
import { useHasInitialData } from "~/lib/data/store";
import { useFeedItemNavigation } from "~/lib/hooks/useFeedItemNavigation";
import { useShortcut } from "~/lib/hooks/useShortcut";
import { REMOTE_IMAGE_PROPS } from "~/lib/remoteMedia";
import { showUndoToast } from "~/lib/undo";
import { VIEW_LAYOUT } from "~/server/db/constants";
import { useRootItemScrollRestoration } from "~/lib/root-scroll-restoration";

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
  const canMutate = useCanMutate();
  const contentStatusFilter = useAtomValue(contentStatusFilterAtom);
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
    if (!canMutate) return;
    if (!isInboxUnread(contentStatusFilter) || sectionItems.length === 0)
      return;

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
          {isInboxUnread(contentStatusFilter) && sectionItems.length > 0 && (
            <ButtonWithShortcut
              variant="outline"
              size="sm"
              onClick={handleMarkSectionAsRead}
              disabled={!canMutate || isLoading}
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
  showHeading,
}: {
  section: ViewSection;
  handleMouseSelect: (itemId: string) => void;
  sectionIndex: number;
  onMarkAsRead?: (sectionIndex: number) => void;
  sectionItemsForAction: string[];
  showHeading: boolean;
}) {
  const { items, layout, name, itemType, itemId } = section;

  const layoutProps = {
    items,
    handleMouseSelect,
    sectionItemType: itemType,
  };

  return (
    <div className="w-full" id={`section-${sectionIndex}`}>
      {showHeading && (
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

function ContentStatusSectionList({
  fullComputedSections,
  visibleComputedSections,
  viewListKey,
  sentinelRef,
  showPaginationLoader,
  showPaginationEnd,
}: {
  fullComputedSections: ViewSection[];
  visibleComputedSections: ViewSection[];
  viewListKey: string;
  sentinelRef: (node: HTMLDivElement | null) => void;
  showPaginationLoader: boolean;
  showPaginationEnd: boolean;
}) {
  const navigationItems = useMemo(
    () => fullComputedSections.flatMap((section) => section.items),
    [fullComputedSections],
  );
  const navigationSectionInfo = useMemo(
    () =>
      fullComputedSections.map((section) => ({
        size: section.items.length,
        isGrid:
          section.layout === VIEW_LAYOUT.GRID ||
          section.layout === VIEW_LAYOUT.LARGE_GRID,
      })),
    [fullComputedSections],
  );
  const navigationIsGridLayout =
    navigationSectionInfo.length === 1 &&
    navigationSectionInfo[0]?.isGrid === true;
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
            showHeading={section.items.length > 0}
          />
        );
      })}
      <div ref={sentinelRef} className="h-px w-full" />
      {showPaginationLoader && <PaginationLoader />}
      {showPaginationEnd && <PaginationEnd />}
    </div>
  );
}

export function RenderViewItems() {
  const { feeds, hasFetchedFeeds } = useFeeds();
  const { hasFetchedFeedCategories } = useFeedCategories();

  const hasInitialData = useHasInitialData();

  const filteredFeedItemsOrder = useFilteredContentOrder();

  const currentView = useAtomValue(viewFilterAtom);
  const feedFilter = useAtomValue(feedFilterAtom);
  const categoryFilter = useAtomValue(categoryFilterAtom);
  const {
    sentinelRef,
    paginationState,
    visibleItems: visibleFilteredFeedItemsOrder,
    hasRenderedAllItems,
  } = useViewListScroll(filteredFeedItemsOrder);

  const { computedSections: fullComputedSections, baseLayout } =
    useViewSections(currentView, filteredFeedItemsOrder);
  const { computedSections: visibleComputedSections } = useViewSections(
    currentView,
    visibleFilteredFeedItemsOrder,
  );
  const contentStatusFilter = useAtomValue(contentStatusFilterAtom);
  const selectedItemId = useAtomValue(selectedItemIdAtom);
  const setSelectedItemId = useSetAtom(selectedItemIdAtom);
  const navigationItems = useMemo(
    () => fullComputedSections.flatMap((section) => section.items),
    [fullComputedSections],
  );
  const rootListReady =
    hasInitialData &&
    (navigationItems.length > 0 ||
      (hasFetchedFeeds &&
        hasFetchedFeedCategories &&
        (paginationState.isLoaded || feeds.length === 0)));
  useRootItemScrollRestoration({
    activeItemIds: navigationItems,
    selectedItemId,
    setSelectedItemId,
    ready: rootListReady,
  });
  const contentStatusKey = buildContentStatusKey(contentStatusFilter);
  const viewListKey = `view-${currentView?.id ?? "none"}-${contentStatusKey}`;
  const contentStatusContextKey = `${viewListKey}-feed-${feedFilter}-tag-${categoryFilter}`;
  const shouldShowPaginationEnd =
    hasRenderedAllItems &&
    paginationState?.hasMore === false &&
    paginationState.isFetching !== true;

  if (!hasInitialData) {
    return <FeedLoading />;
  }

  if (
    paginationState.isLoaded &&
    hasFetchedFeeds &&
    !feeds.length &&
    filteredFeedItemsOrder.length === 0 &&
    Object.keys(bookmarksStore.getState().snapshot()).length === 0
  ) {
    return <FeedEmptyState />;
  }

  // Show skeletons while feed items are being fetched
  if (
    (!paginationState.isLoaded || paginationState.isFetching) &&
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
    paginationState.isLoaded &&
    hasFetchedFeedCategories &&
    !filteredFeedItemsOrder.length
  ) {
    return <EmptyState />;
  }

  return (
    <ContentStatusSectionList
      key={contentStatusContextKey}
      fullComputedSections={fullComputedSections}
      visibleComputedSections={visibleComputedSections}
      viewListKey={viewListKey}
      sentinelRef={sentinelRef}
      showPaginationLoader={paginationState?.isFetching === true}
      showPaginationEnd={shouldShowPaginationEnd}
    />
  );
}
