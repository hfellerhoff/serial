import { INBOX_VIEW_ID } from "../views/constants";
import { isFeedCompatibleWithContentFilter } from "./filters";
import type {
  ApplicationFeedItem,
  ApplicationView,
  DatabaseFeedCategory,
} from "~/server/db/schema";
import { VIEW_LAYOUT_ITEM_TYPE } from "~/server/db/constants";
import { contentFilterAllowsDescriptor } from "~/lib/views/contentFilter";

export type FeedItemListProjection = Pick<
  ApplicationFeedItem,
  | "id"
  | "feedId"
  | "isWatched"
  | "isWatchLater"
  | "isWatchedUpdatedAt"
  | "contentType"
  | "orientation"
  | "platform"
  | "postedAt"
  | "url"
>;

export type FeedItemFilterIndex = {
  categoryIdsByFeedId: ReadonlyMap<number, ReadonlySet<number>>;
  feedIdsByCategoryId: ReadonlyMap<number, ReadonlySet<number>>;
  feedIdsByViewId: ReadonlyMap<number, ReadonlySet<number>>;
  customViewsByCategoryId: ReadonlyMap<number, readonly ApplicationView[]>;
  customViewsByFeedId: ReadonlyMap<number, readonly ApplicationView[]>;
};

function addToSetMap(
  map: Map<number, Set<number>>,
  key: number,
  value: number,
) {
  const values = map.get(key);
  if (values) {
    values.add(value);
  } else {
    map.set(key, new Set([value]));
  }
}

function addToArrayMap<T>(map: Map<number, T[]>, key: number, value: T) {
  const values = map.get(key);
  if (values) {
    values.push(value);
  } else {
    map.set(key, [value]);
  }
}

export function createFeedItemFilterIndex(
  feedCategories: readonly DatabaseFeedCategory[],
  views: readonly ApplicationView[],
): FeedItemFilterIndex {
  const categoryIdsByFeedId = new Map<number, Set<number>>();
  const feedIdsByCategoryId = new Map<number, Set<number>>();

  for (const feedCategory of feedCategories) {
    addToSetMap(
      categoryIdsByFeedId,
      feedCategory.feedId,
      feedCategory.categoryId,
    );
    addToSetMap(
      feedIdsByCategoryId,
      feedCategory.categoryId,
      feedCategory.feedId,
    );
  }

  const feedIdsByViewId = new Map<number, Set<number>>();
  const customViewsByCategoryId = new Map<number, ApplicationView[]>();
  const customViewsByFeedId = new Map<number, ApplicationView[]>();

  for (const view of views) {
    const feedIds = new Set(view.feedIds);
    for (const categoryId of view.categoryIds) {
      for (const feedId of feedIdsByCategoryId.get(categoryId) ?? []) {
        feedIds.add(feedId);
      }
    }
    feedIdsByViewId.set(view.id, feedIds);

    if (view.id === INBOX_VIEW_ID) continue;

    for (const categoryId of view.categoryIds) {
      addToArrayMap(customViewsByCategoryId, categoryId, view);
    }
    for (const feedId of view.feedIds) {
      addToArrayMap(customViewsByFeedId, feedId, view);
    }
  }

  return {
    categoryIdsByFeedId,
    feedIdsByCategoryId,
    feedIdsByViewId,
    customViewsByCategoryId,
    customViewsByFeedId,
  };
}

export function hasFeedItemListProjectionChanged(
  previousItem: FeedItemListProjection | undefined,
  nextItem: FeedItemListProjection,
) {
  if (!previousItem) return true;

  return (
    previousItem.feedId !== nextItem.feedId ||
    previousItem.isWatched !== nextItem.isWatched ||
    previousItem.isWatchLater !== nextItem.isWatchLater ||
    previousItem.isWatchedUpdatedAt?.getTime() !==
      nextItem.isWatchedUpdatedAt?.getTime() ||
    previousItem.contentType !== nextItem.contentType ||
    previousItem.orientation !== nextItem.orientation ||
    previousItem.platform !== nextItem.platform ||
    previousItem.url !== nextItem.url ||
    previousItem.postedAt.getTime() !== nextItem.postedAt.getTime()
  );
}

export function createFeedItemFilterPredicate({
  visibilityFilter,
  categoryFilter,
  feedFilter,
  viewFilter,
  filterIndex,
  now = new Date(),
}: {
  visibilityFilter: "unread" | "read" | "later";
  categoryFilter: number;
  feedFilter: number;
  viewFilter: ApplicationView | null;
  filterIndex: FeedItemFilterIndex;
  now?: Date;
}) {
  const categoryFeedIds = filterIndex.feedIdsByCategoryId.get(categoryFilter);
  const viewFeedIds = viewFilter
    ? filterIndex.feedIdsByViewId.get(viewFilter.id)
    : undefined;
  const cutoffTime = (() => {
    if (!viewFilter?.daysWindow) return undefined;
    const cutoffDate = new Date(now);
    cutoffDate.setDate(cutoffDate.getDate() - viewFilter.daysWindow);
    return cutoffDate.getTime();
  })();

  return (item: FeedItemListProjection) => {
    if (visibilityFilter === "unread" && item.isWatchLater) return false;
    if (visibilityFilter === "unread" && item.isWatched) return false;
    if (visibilityFilter === "read" && (!item.isWatched || item.isWatchLater)) {
      return false;
    }
    if (visibilityFilter === "later" && !item.isWatchLater) return false;

    if (categoryFilter >= 0 && !categoryFeedIds?.has(item.feedId)) return false;
    if (feedFilter >= 0 && item.feedId !== feedFilter) return false;

    if (viewFilter?.id === INBOX_VIEW_ID) {
      const itemCategoryIds =
        filterIndex.categoryIdsByFeedId.get(item.feedId) ?? [];
      const wouldAppearViaCategory = Array.from(itemCategoryIds).some(
        (categoryId) =>
          filterIndex.customViewsByCategoryId
            .get(categoryId)
            ?.some((view) =>
              isFeedCompatibleWithContentFilter(
                item.platform,
                view.contentFilter,
              ),
            ) ?? false,
      );
      const wouldAppearViaDirectAssignment =
        filterIndex.customViewsByFeedId
          .get(item.feedId)
          ?.some((view) =>
            isFeedCompatibleWithContentFilter(
              item.platform,
              view.contentFilter,
            ),
          ) ?? false;

      if (wouldAppearViaCategory || wouldAppearViaDirectAssignment) {
        return false;
      }

      if (Array.from(itemCategoryIds).length === 0) return true;
    }

    if (
      !!viewFilter &&
      viewFilter.id !== INBOX_VIEW_ID &&
      !viewFeedIds?.has(item.feedId)
    ) {
      return false;
    }

    if (
      viewFilter &&
      !contentFilterAllowsDescriptor(viewFilter.contentFilter, item)
    ) {
      return false;
    }

    if (cutoffTime !== undefined && item.postedAt.getTime() < cutoffTime) {
      return false;
    }

    return true;
  };
}

export function getItemSectionPlacement(
  item: FeedItemListProjection,
  viewFilter: ApplicationView | null,
  filterIndex: FeedItemFilterIndex,
) {
  const viewSections = viewFilter?.viewSections;
  if (!viewSections?.length) return undefined;

  let feedSectionPlacement = Infinity;
  let tagSectionPlacement = Infinity;
  const itemCategoryIds = filterIndex.categoryIdsByFeedId.get(item.feedId);

  for (const section of viewSections) {
    if (
      section.itemType === VIEW_LAYOUT_ITEM_TYPE.FEED &&
      section.itemId === item.feedId
    ) {
      feedSectionPlacement = Math.min(feedSectionPlacement, section.placement);
      continue;
    }

    if (
      section.itemType === VIEW_LAYOUT_ITEM_TYPE.TAG &&
      itemCategoryIds?.has(section.itemId)
    ) {
      tagSectionPlacement = Math.min(tagSectionPlacement, section.placement);
    }
  }

  if (feedSectionPlacement !== Infinity) return feedSectionPlacement;
  if (tagSectionPlacement !== Infinity) return tagSectionPlacement;
  return 999999;
}
