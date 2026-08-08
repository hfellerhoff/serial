"use client";

import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArchiveIcon, CheckIcon } from "lucide-react";
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
import {
  createSavedArchiveSnapshot,
  filterSavedSectionItems,
} from "./savedArchiveVisibility";
import type { ViewSection } from "./useViewSections";
import { VIEW_LAYOUT } from "~/server/db/constants";
import FeedLoading from "~/components/loading";
import { ButtonWithShortcut } from "~/components/ButtonWithShortcut";
import { SHORTCUT_KEYS } from "~/lib/constants/shortcuts";
import { useLazyCategoryFilter } from "~/lib/hooks/useLazyCategoryFilter";
import { useLazyFeedFilter } from "~/lib/hooks/useLazyFeedFilter";
import { useValidateViewItems } from "~/lib/hooks/useValidateViewItems";
import {
  categoryFilterAtom,
  feedFilterAtom,
  selectedItemIdAtom,
  viewFilterAtom,
  visibilityFilterAtom,
} from "~/lib/data/atoms";
import { useFeedCategories } from "~/lib/data/feed-categories";
import { useFeeds } from "~/lib/data/feeds";
import { REMOTE_IMAGE_PROPS } from "~/lib/remoteMedia";
import { useFilteredContentOrder } from "~/lib/data/feed-items";
import {
  useFeedItemsListProjection,
  useFetchFeedItemsLastFetchedAt,
  useHasInitialData,
} from "~/lib/data/store";
import { useFeedItemNavigation } from "~/lib/hooks/useFeedItemNavigation";
import { useShortcut } from "~/lib/hooks/useShortcut";
import { showUndoToast } from "~/lib/undo";
import { bookmarksStore } from "~/lib/data/bookmarks/store";
import { setMixedReadValue } from "~/lib/data/mixed-content/mutations";
import { Toggle } from "~/components/ui/toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";

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
  showArchiveToggle,
  showArchived,
  onShowArchivedChange,
}: {
  name: string;
  itemType?: "feed" | "tag";
  itemId?: number;
  sectionItems: string[];
  sectionIndex: number;
  onMarkAsRead?: (sectionIndex: number) => void;
  showArchiveToggle: boolean;
  showArchived: boolean;
  onShowArchivedChange: (pressed: boolean) => void;
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
          {showArchiveToggle && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Toggle
                  aria-label={
                    showArchived ? "Hide archived items" : "Show archived items"
                  }
                  variant="outline"
                  size="sm"
                  pressed={showArchived}
                  onPressedChange={onShowArchivedChange}
                  className="w-8 px-0"
                >
                  <ArchiveIcon size={14} />
                </Toggle>
              </TooltipTrigger>
              <TooltipContent>
                {showArchived ? "Hide archived items" : "Show archived items"}
              </TooltipContent>
            </Tooltip>
          )}
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
  showHeading,
  showArchiveToggle,
  showArchived,
  onShowArchivedChange,
}: {
  section: ViewSection;
  handleMouseSelect: (itemId: string) => void;
  sectionIndex: number;
  onMarkAsRead?: (sectionIndex: number) => void;
  sectionItemsForAction: string[];
  showHeading: boolean;
  showArchiveToggle: boolean;
  showArchived: boolean;
  onShowArchivedChange: (pressed: boolean) => void;
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
          showArchiveToggle={showArchiveToggle}
          showArchived={showArchived}
          onShowArchivedChange={onShowArchivedChange}
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

function getSectionKey(section: ViewSection) {
  return section.isUncategorized
    ? "uncategorized"
    : `${section.itemType ?? "section"}:${section.itemId ?? section.name}`;
}

function SavedAwareSectionList({
  fullComputedSections,
  visibleComputedSections,
  visibilityFilter,
  viewListKey,
  sentinelRef,
  showPaginationLoader,
  showPaginationEnd,
}: {
  fullComputedSections: ViewSection[];
  visibleComputedSections: ViewSection[];
  visibilityFilter: "unread" | "read" | "later";
  viewListKey: string;
  sentinelRef: (node: HTMLDivElement | null) => void;
  showPaginationLoader: boolean;
  showPaginationEnd: boolean;
}) {
  const feedItemsProjection = useFeedItemsListProjection();
  const bookmarkRevision = bookmarksStore.useRevision();
  const [sectionsShowingArchived, setSectionsShowingArchived] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const allItemIds = useMemo(
    () => fullComputedSections.flatMap((section) => section.items),
    [fullComputedSections],
  );
  const archivedSnapshot = useMemo(() => {
    void bookmarkRevision;
    const feedItems = feedItemsProjection.getItems();
    return createSavedArchiveSnapshot(allItemIds, (itemId) => {
      const bookmark = bookmarksStore.getState().getBookmark(itemId);
      if (bookmark) return bookmark.isRead;
      return feedItems[itemId]?.isWatched;
    });
  }, [allItemIds, bookmarkRevision, feedItemsProjection]);

  const filterSection = useCallback(
    (section: ViewSection) => {
      if (visibilityFilter !== "later") return section;
      return {
        ...section,
        items: filterSavedSectionItems({
          itemIds: section.items,
          archivedSnapshot,
          showArchived: sectionsShowingArchived.has(getSectionKey(section)),
        }),
      };
    },
    [archivedSnapshot, sectionsShowingArchived, visibilityFilter],
  );
  const filteredFullSections = useMemo(
    () => fullComputedSections.map(filterSection),
    [filterSection, fullComputedSections],
  );
  const filteredVisibleSections = useMemo(
    () => visibleComputedSections.map(filterSection),
    [filterSection, visibleComputedSections],
  );
  const navigationItems = useMemo(
    () => filteredFullSections.flatMap((section) => section.items),
    [filteredFullSections],
  );
  const navigationSectionInfo = useMemo(
    () =>
      filteredFullSections.map((section) => ({
        size: section.items.length,
        isGrid:
          section.layout === VIEW_LAYOUT.GRID ||
          section.layout === VIEW_LAYOUT.LARGE_GRID,
      })),
    [filteredFullSections],
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
        filteredFullSections,
      );

      requestAnimationFrame(() => {
        requestAnimationFrame(() => selectItem(nextItemId));
      });
    },
    [filteredFullSections, selectItem],
  );

  return (
    <div className="w-full">
      {filteredVisibleSections.map((section, index) => {
        const originalVisibleSection = visibleComputedSections[index];
        const sectionKey = getSectionKey(section);
        const showArchived = sectionsShowingArchived.has(sectionKey);
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
            sectionItemsForAction={filteredFullSections[index]?.items ?? []}
            showHeading={(originalVisibleSection?.items.length ?? 0) > 0}
            showArchiveToggle={visibilityFilter === "later"}
            showArchived={showArchived}
            onShowArchivedChange={(pressed) => {
              setSectionsShowingArchived((currentSectionKeys) => {
                const nextSectionKeys = new Set(currentSectionKeys);
                if (pressed) nextSectionKeys.add(sectionKey);
                else nextSectionKeys.delete(sectionKey);
                return nextSectionKeys;
              });
            }}
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
  useLazyFeedFilter();
  useLazyCategoryFilter();
  useValidateViewItems();

  const { feeds, hasFetchedFeeds } = useFeeds();
  const { hasFetchedFeedCategories } = useFeedCategories();

  const feedItemsLastFetchedAt = useFetchFeedItemsLastFetchedAt();
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
  const visibilityFilter = useAtomValue(visibilityFilterAtom);
  const viewListKey = `view-${currentView?.id ?? "none"}-${visibilityFilter}`;
  const savedContextKey = `${viewListKey}-feed-${feedFilter}-tag-${categoryFilter}`;
  const shouldShowPaginationEnd =
    hasRenderedAllItems &&
    paginationState?.hasMore === false &&
    paginationState.isFetching !== true;

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
    <SavedAwareSectionList
      key={savedContextKey}
      fullComputedSections={fullComputedSections}
      visibleComputedSections={visibleComputedSections}
      visibilityFilter={visibilityFilter}
      viewListKey={viewListKey}
      sentinelRef={sentinelRef}
      showPaginationLoader={paginationState?.isFetching === true}
      showPaginationEnd={shouldShowPaginationEnd}
    />
  );
}
