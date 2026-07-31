import type {
  FeedItemFilterIndex,
  FeedItemListProjection,
} from "./data/feed-items/listProjection";
import type { ApplicationViewSection } from "~/server/db/schema";
import { VIEW_LAYOUT_ITEM_TYPE } from "~/server/db/constants";

function getItemPlacement(
  feedId: number,
  viewSections: ApplicationViewSection[],
  filterIndex: FeedItemFilterIndex,
): number {
  let minFeedPlacement = Infinity;
  let minTagPlacement = Infinity;

  for (const section of viewSections) {
    if (section.itemType === VIEW_LAYOUT_ITEM_TYPE.FEED) {
      if (section.itemId === feedId) {
        minFeedPlacement = Math.min(minFeedPlacement, section.placement);
      }
    } else if (
      section.itemType === VIEW_LAYOUT_ITEM_TYPE.TAG &&
      filterIndex.categoryIdsByFeedId.get(feedId)?.has(section.itemId)
    ) {
      minTagPlacement = Math.min(minTagPlacement, section.placement);
    }
  }

  if (minFeedPlacement !== Infinity) {
    return minFeedPlacement;
  }

  return minTagPlacement === Infinity ? 999999 : minTagPlacement;
}

export function sortFeedItemsOrderByDate(
  feedItems: Record<string, FeedItemListProjection>,
) {
  return function (a: string, b: string) {
    const itemA = feedItems[a];
    const itemB = feedItems[b];

    if (!itemA || !itemB) return 0;

    const timeA =
      itemA.postedAt instanceof Date
        ? itemA.postedAt.getTime()
        : new Date(itemA.postedAt).getTime();
    const timeB =
      itemB.postedAt instanceof Date
        ? itemB.postedAt.getTime()
        : new Date(itemB.postedAt).getTime();

    if (timeB !== timeA) {
      return timeB - timeA;
    }

    return itemB.id.localeCompare(itemA.id);
  };
}

export function sortFeedItemsOrderByWatchedAt(
  feedItems: Record<string, FeedItemListProjection>,
) {
  return function (a: string, b: string) {
    const itemA = feedItems[a];
    const itemB = feedItems[b];

    if (!itemA || !itemB) return 0;

    const watchedTimeA = itemA.isWatchedUpdatedAt
      ? itemA.isWatchedUpdatedAt instanceof Date
        ? itemA.isWatchedUpdatedAt.getTime()
        : new Date(itemA.isWatchedUpdatedAt).getTime()
      : 0;
    const watchedTimeB = itemB.isWatchedUpdatedAt
      ? itemB.isWatchedUpdatedAt instanceof Date
        ? itemB.isWatchedUpdatedAt.getTime()
        : new Date(itemB.isWatchedUpdatedAt).getTime()
      : 0;

    if (watchedTimeB !== watchedTimeA) {
      return watchedTimeB - watchedTimeA;
    }

    const timeA =
      itemA.postedAt instanceof Date
        ? itemA.postedAt.getTime()
        : new Date(itemA.postedAt).getTime();
    const timeB =
      itemB.postedAt instanceof Date
        ? itemB.postedAt.getTime()
        : new Date(itemB.postedAt).getTime();

    if (timeB !== timeA) {
      return timeB - timeA;
    }

    return itemB.id.localeCompare(itemA.id);
  };
}

export function sortFeedItemsOrderBySectionThenDate(
  feedItems: Record<string, FeedItemListProjection>,
  viewSections: ApplicationViewSection[],
  filterIndex: FeedItemFilterIndex,
) {
  return function (a: string, b: string) {
    const itemA = feedItems[a];
    const itemB = feedItems[b];

    if (!itemA || !itemB) return 0;

    const placementA = getItemPlacement(
      itemA.feedId,
      viewSections,
      filterIndex,
    );
    const placementB = getItemPlacement(
      itemB.feedId,
      viewSections,
      filterIndex,
    );

    if (placementA !== placementB) {
      return placementA - placementB;
    }

    const timeA =
      itemA.postedAt instanceof Date
        ? itemA.postedAt.getTime()
        : new Date(itemA.postedAt).getTime();
    const timeB =
      itemB.postedAt instanceof Date
        ? itemB.postedAt.getTime()
        : new Date(itemB.postedAt).getTime();

    if (timeB !== timeA) {
      return timeB - timeA;
    }

    return itemB.id.localeCompare(itemA.id);
  };
}
