"use client";

import { useMemo } from "react";
import type { ApplicationView } from "~/server/db/schema";
import type { ViewLayout } from "~/server/db/constants";
import { useFeedCategories } from "~/lib/data/feed-categories";
import { useFeedItemsListProjection } from "~/lib/data/store";
import { createFeedItemFilterIndex } from "~/lib/data/feed-items";
import { useContentCategories } from "~/lib/data/content-categories";
import { useFeeds } from "~/lib/data/feeds";
import {
  VIEW_LAYOUT,
  VIEW_LAYOUT_ITEM_TYPE,
  viewLayoutSchema,
} from "~/server/db/constants";
import { INBOX_VIEW_ID } from "~/lib/data/views/constants";
import { bookmarksStore } from "~/lib/data/bookmarks/store";
import { UNCATEGORIZED_SECTION_PLACEMENT } from "~/lib/views/sections";

export interface ViewSection {
  name: string;
  items: string[];
  layout: ViewLayout;
  startIndex: number;
  isUncategorized: boolean;
  itemType?: "feed" | "tag";
  itemId?: number;
  placement: number | null;
}

export function useViewSections(
  currentView: ApplicationView | null,
  filteredFeedItemsOrder: string[],
) {
  const { feeds } = useFeeds();
  const { contentCategories } = useContentCategories();
  const feedItemsProjection = useFeedItemsListProjection();
  const feedCategories = useFeedCategories();
  bookmarksStore.useRevision();
  const filterIndex = useMemo(
    () => createFeedItemFilterIndex(feedCategories.feedCategories, []),
    [feedCategories.feedCategories],
  );

  const isUncategorized = currentView?.id === INBOX_VIEW_ID;

  const baseLayout = useMemo(() => {
    const parsed = viewLayoutSchema.safeParse(currentView?.layout);
    return isUncategorized || !parsed.success ? VIEW_LAYOUT.LIST : parsed.data;
  }, [currentView?.layout, isUncategorized]);

  const hasSubviews =
    currentView &&
    !isUncategorized &&
    currentView.viewSections &&
    currentView.viewSections.length > 0;

  const computedSections = useMemo(() => {
    if (!hasSubviews || !currentView) {
      return [
        {
          name: currentView?.name ?? "View",
          items: filteredFeedItemsOrder,
          layout: baseLayout,
          startIndex: 0,
          isUncategorized: true,
          placement: null,
        },
      ] as ViewSection[];
    }

    const feedItemsDict = feedItemsProjection.getItems();
    const assignedItemIds = new Set<string>();
    const bookmarkTagIdsById = new Map<string, Set<number>>();
    const feedIdsInFeedSections = new Set<number>();
    const feedNameById = new Map(feeds.map((feed) => [feed.id, feed.name]));
    const categoryNameById = new Map(
      contentCategories.map((category) => [category.id, category.name]),
    );

    for (const li of currentView.viewSections) {
      if (li.itemType === VIEW_LAYOUT_ITEM_TYPE.FEED) {
        feedIdsInFeedSections.add(li.itemId);
      }
    }

    const sections: ViewSection[] = [];
    let startIndex = 0;

    for (const li of currentView.viewSections) {
      const sectionItems = filteredFeedItemsOrder.filter((itemId) => {
        if (assignedItemIds.has(itemId)) return false;

        const bookmark = bookmarksStore.getState().getBookmark(itemId);
        if (bookmark) {
          let bookmarkTagIds = bookmarkTagIdsById.get(itemId);
          if (!bookmarkTagIds) {
            bookmarkTagIds = new Set(bookmark.tagIds);
            bookmarkTagIdsById.set(itemId, bookmarkTagIds);
          }
          if (
            li.itemType === VIEW_LAYOUT_ITEM_TYPE.TAG &&
            bookmarkTagIds.has(li.itemId)
          ) {
            assignedItemIds.add(itemId);
            return true;
          }
          return false;
        }

        const item = feedItemsDict[itemId];
        if (!item) return false;

        if (li.itemType === VIEW_LAYOUT_ITEM_TYPE.FEED) {
          if (item.feedId === li.itemId) {
            assignedItemIds.add(itemId);
            return true;
          }
          return false;
        }
        if (li.itemType === VIEW_LAYOUT_ITEM_TYPE.TAG) {
          const categoryIds = filterIndex.categoryIdsByFeedId.get(item.feedId);
          if (
            categoryIds?.has(li.itemId) &&
            !feedIdsInFeedSections.has(item.feedId)
          ) {
            assignedItemIds.add(itemId);
            return true;
          }
          return false;
        }
        return false;
      });

      const resolvedName =
        li.itemType === VIEW_LAYOUT_ITEM_TYPE.FEED
          ? (feedNameById.get(li.itemId) ?? "")
          : (categoryNameById.get(li.itemId) ?? "");

      const layout = (li.layout ?? baseLayout) as ViewLayout;

      sections.push({
        name: resolvedName,
        items: sectionItems,
        layout,
        startIndex,
        isUncategorized: false,
        itemType: li.itemType,
        itemId: li.itemId,
        placement: li.placement,
      });

      startIndex += sectionItems.length;
    }

    // Uncategorized: items not in any section
    const uncategorizedItems = filteredFeedItemsOrder.filter(
      (id) => !assignedItemIds.has(id),
    );

    sections.push({
      name: "Uncategorized",
      items: uncategorizedItems,
      layout: baseLayout,
      startIndex,
      isUncategorized: true,
      placement: UNCATEGORIZED_SECTION_PLACEMENT,
    });

    return sections;
  }, [
    hasSubviews,
    currentView,
    filteredFeedItemsOrder,
    feeds,
    contentCategories,
    baseLayout,
    feedItemsProjection,
    filterIndex,
  ]);

  const flatItems = useMemo(() => {
    return computedSections.flatMap((s) => s.items);
  }, [computedSections]);

  const hasGridSections = useMemo(() => {
    if (!hasSubviews) {
      return (
        baseLayout === VIEW_LAYOUT.GRID || baseLayout === VIEW_LAYOUT.LARGE_GRID
      );
    }
    return computedSections.some(
      (s) =>
        s.layout === VIEW_LAYOUT.GRID || s.layout === VIEW_LAYOUT.LARGE_GRID,
    );
  }, [hasSubviews, baseLayout, computedSections]);

  const sectionInfo = useMemo(() => {
    return computedSections.map((s) => ({
      size: s.items.length,
      isGrid:
        s.layout === VIEW_LAYOUT.GRID || s.layout === VIEW_LAYOUT.LARGE_GRID,
    }));
  }, [computedSections]);

  return {
    hasSubviews,
    computedSections,
    flatItems,
    hasGridSections,
    sectionInfo,
    baseLayout,
  };
}
