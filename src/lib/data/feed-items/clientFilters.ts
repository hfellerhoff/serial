import { INBOX_VIEW_ID } from "../views/constants";
import { isFeedCompatibleWithContentType } from "./filters";
import type {
  ApplicationFeedItem,
  ApplicationView,
  DatabaseFeedCategory,
} from "~/server/db/schema";
import { VIEW_LAYOUT_ITEM_TYPE } from "~/server/db/constants";

function isVideoContent(item: ApplicationFeedItem): boolean {
  const videoPlatforms = ["youtube", "peertube", "nebula"];
  return videoPlatforms.includes(item.platform);
}

export function getItemSectionPlacement(
  item: ApplicationFeedItem,
  viewFilter: ApplicationView | null,
  feedCategories: DatabaseFeedCategory[],
) {
  const viewSections = viewFilter?.viewSections;
  if (!viewSections?.length) return undefined;

  let feedSectionPlacement = Infinity;
  let tagSectionPlacement = Infinity;

  for (const section of viewSections) {
    if (
      section.itemType === VIEW_LAYOUT_ITEM_TYPE.FEED &&
      section.itemId === item.feedId
    ) {
      feedSectionPlacement = Math.min(feedSectionPlacement, section.placement);
      continue;
    }

    if (section.itemType !== VIEW_LAYOUT_ITEM_TYPE.TAG) continue;

    const itemHasSectionTag = feedCategories.some(
      (feedCategory) =>
        feedCategory.feedId === item.feedId &&
        feedCategory.categoryId === section.itemId,
    );
    if (itemHasSectionTag) {
      tagSectionPlacement = Math.min(tagSectionPlacement, section.placement);
    }
  }

  if (feedSectionPlacement !== Infinity) return feedSectionPlacement;
  if (tagSectionPlacement !== Infinity) return tagSectionPlacement;
  return 999999;
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
  customViewFeedIds,
}: {
  item: ApplicationFeedItem;
  visibilityFilter: "unread" | "read" | "later";
  categoryFilter: number;
  feedCategories: DatabaseFeedCategory[];
  feedFilter: number;
  viewFilter: ApplicationView | null;
  customViewCategoryIds?: Set<number>;
  customViews?: ApplicationView[];
  customViewFeedIds?: Set<number>;
}) {
  if (visibilityFilter === "unread" && item.isWatchLater) {
    return false;
  }
  if (visibilityFilter === "unread" && item.isWatched) {
    return false;
  }
  if (visibilityFilter === "read" && (!item.isWatched || item.isWatchLater)) {
    return false;
  }
  if (visibilityFilter === "later" && !item.isWatchLater) {
    return false;
  }

  const feedIdsInCategory = feedCategories
    .filter((category) => category.categoryId === categoryFilter)
    .map((category) => category.feedId);
  if (categoryFilter >= 0 && !feedIdsInCategory.includes(item.feedId)) {
    return false;
  }

  if (feedFilter >= 0 && item.feedId !== feedFilter) {
    return false;
  }

  const feedsForViewByCategory = feedCategories
    .filter((category) => viewFilter?.categoryIds.includes(category.categoryId))
    .map((category) => category.feedId);

  const directlyAssignedFeedIds = viewFilter?.feedIds ?? [];
  const feedsForView = [
    ...new Set([...feedsForViewByCategory, ...directlyAssignedFeedIds]),
  ];

  const doesFeedHaveAnyCategories = feedCategories.some(
    (category) => category.feedId === item.feedId,
  );

  if (viewFilter?.id === INBOX_VIEW_ID) {
    const feedCategoriesForItem = feedCategories.filter(
      (feedCategory) =>
        feedCategory.feedId === item.feedId &&
        customViewCategoryIds?.has(feedCategory.categoryId),
    );

    const wouldAppearViaCategory = feedCategoriesForItem.some(
      (feedCategory) => {
        if (!customViews) return true;

        const viewsWithCategory = customViews.filter((view) =>
          view.categoryIds.includes(feedCategory.categoryId),
        );

        return viewsWithCategory.some((view) =>
          isFeedCompatibleWithContentType(item.platform, view.contentType),
        );
      },
    );

    const wouldAppearViaDirectAssignment =
      !!customViewFeedIds?.has(item.feedId) &&
      (customViews?.some(
        (view) =>
          view.feedIds.includes(item.feedId) &&
          isFeedCompatibleWithContentType(item.platform, view.contentType),
      ) ??
        true);

    if (wouldAppearViaCategory || wouldAppearViaDirectAssignment) {
      return false;
    }

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

  if (viewFilter?.contentType) {
    const contentType = viewFilter.contentType;
    if (contentType === "longform" && item.orientation === "vertical") {
      return false;
    }
    if (
      contentType === "horizontal-video" &&
      (!isVideoContent(item) || item.orientation !== "horizontal")
    ) {
      return false;
    }
    if (
      contentType === "vertical-video" &&
      (!isVideoContent(item) || item.orientation !== "vertical")
    ) {
      return false;
    }
  }

  if (viewFilter?.daysWindow && viewFilter.daysWindow > 0) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - viewFilter.daysWindow);

    if (item.postedAt < cutoffDate) {
      return false;
    }
  }

  return true;
}
