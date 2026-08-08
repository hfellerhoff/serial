import { and, eq, gte, inArray } from "drizzle-orm";

import { INBOX_VIEW_ID } from "../views/constants";
import type { SQL } from "drizzle-orm";
import type { VisibilityFilter } from "../atoms";
import type {
  ApplicationView,
  DatabaseFeed,
  DatabaseFeedCategory,
} from "~/server/db/schema";
import type { ContentPlatform } from "~/lib/content/descriptor";
import type { ContentFilter } from "~/lib/views/contentFilter";
import {
  CONTENT_FILTER_OPTION,
  contentFilterSqlPredicate,
  hasContentFilterOption,
} from "~/lib/views/contentFilter";
import { feedItems } from "~/server/db/schema";

/** Video platforms that support orientation filtering */
export const VIDEO_PLATFORMS = ["youtube", "peertube", "nebula"] as const;

export type VideoPlatform = (typeof VIDEO_PLATFORMS)[number];

/**
 * Check whether a Feed can produce items accepted by a View filter.
 *
 * A feed is compatible if its items could potentially appear in the view:
 * - "all" or "longform": all platforms are compatible
 * - "horizontal-video" or "vertical-video": only video platforms are compatible
 */
export function isFeedCompatibleWithContentFilter(
  feedPlatform: ContentPlatform,
  contentFilter: ContentFilter,
): boolean {
  if (feedPlatform === "website") {
    return hasContentFilterOption(contentFilter, CONTENT_FILTER_OPTION.TEXT);
  }
  if (feedPlatform === "youtube") {
    return (
      hasContentFilterOption(contentFilter, CONTENT_FILTER_OPTION.VIDEOS) ||
      hasContentFilterOption(contentFilter, CONTENT_FILTER_OPTION.SHORTS)
    );
  }
  return hasContentFilterOption(contentFilter, CONTENT_FILTER_OPTION.VIDEOS);
}

/**
 * Build a Drizzle filter condition for visibility (unread/read/later)
 *
 * - "unread": items that are not watched AND not watch later
 * - "read": items that are watched AND not watch later
 * - "later": unread items that are marked as watch later
 */
export function buildVisibilityFilter(
  visibilityFilter: VisibilityFilter,
): SQL | undefined {
  switch (visibilityFilter) {
    case "unread":
      return and(
        eq(feedItems.isWatched, false),
        eq(feedItems.isWatchLater, false),
      );
    case "read":
      return and(
        eq(feedItems.isWatched, true),
        eq(feedItems.isWatchLater, false),
      );
    case "later":
      return and(
        eq(feedItems.isWatchLater, true),
        eq(feedItems.isWatched, false),
      );
    default:
      return undefined;
  }
}

/**
 * Build a Drizzle filter condition for view category filtering
 *
 * For the Uncategorized view: includes feeds that either match the view's categories
 * OR have no categories at all (uncategorized feeds), but EXCLUDES any feeds
 * that belong to categories assigned to custom views AND whose platform is
 * compatible with that view's content type.
 *
 * For regular views: includes only feeds that match the view's categories.
 */
export function buildViewCategoryFilter(
  viewFilter: ApplicationView | null,
  feedCategories: DatabaseFeedCategory[],
  allFeedIds: number[],
  customViewCategoryIds?: Set<number>,
  customViews?: ApplicationView[],
  feeds?: DatabaseFeed[],
  customViewFeedIds?: Set<number>,
): SQL | undefined {
  if (
    !viewFilter ||
    (viewFilter.categoryIds.length === 0 && viewFilter.feedIds.length === 0)
  ) {
    return undefined;
  }

  // Get feed IDs that are in any of the view's categories
  const viewCategoryIds = new Set(viewFilter.categoryIds);
  const feedsFromCategories = feedCategories
    .filter((fc) => viewCategoryIds.has(fc.categoryId))
    .map((fc) => fc.feedId);

  // Union category-based feeds with directly assigned feeds
  const feedsForView = [
    ...new Set([...feedsFromCategories, ...viewFilter.feedIds]),
  ];

  // For Uncategorized view, also include uncategorized feeds, but exclude feeds in custom views
  if (viewFilter.id === INBOX_VIEW_ID) {
    const categorizedFeedIds = new Set(feedCategories.map((fc) => fc.feedId));
    const uncategorizedFeedIds = allFeedIds.filter(
      (id) => !categorizedFeedIds.has(id),
    );

    // Build a map of feedId -> feed for quick lookup
    const feedsById = new Map(feeds?.map((f) => [f.id, f]) ?? []);

    // Exclude feeds that belong to a category assigned to a custom view
    // AND whose platform is compatible with that view's content type
    const feedsInCustomViews = new Set<number>();

    // Also exclude feeds directly assigned to any custom view, but only if
    // the assigned view's content type is compatible with the feed's platform
    // (otherwise the feed would be orphaned: filtered out of the custom view
    // by the content-type filter, and excluded from Inbox here too).
    if (customViewFeedIds && customViews) {
      for (const feedId of customViewFeedIds) {
        const feed = feedsById.get(feedId);
        if (!feed) continue;

        const wouldAppearInDirectView = customViews.some(
          (v) =>
            v.feedIds.includes(feedId) &&
            isFeedCompatibleWithContentFilter(
              feed.platform as ContentPlatform,
              v.contentFilter,
            ),
        );

        if (wouldAppearInDirectView) {
          feedsInCustomViews.add(feedId);
        }
      }
    }

    if (customViews && customViewCategoryIds) {
      for (const fc of feedCategories) {
        if (!customViewCategoryIds.has(fc.categoryId)) continue;

        const feed = feedsById.get(fc.feedId);
        if (!feed) continue;

        // Check if any custom view with this category would show this feed
        const viewsWithCategory = customViews.filter((v) =>
          v.categoryIds.includes(fc.categoryId),
        );

        const wouldAppearInAnyView = viewsWithCategory.some((v) =>
          isFeedCompatibleWithContentFilter(
            feed.platform as ContentPlatform,
            v.contentFilter,
          ),
        );

        if (wouldAppearInAnyView) {
          feedsInCustomViews.add(fc.feedId);
        }
      }
    }

    const allIncludedFeedIds = [
      ...new Set([...feedsForView, ...uncategorizedFeedIds]),
    ].filter((id) => !feedsInCustomViews.has(id));

    if (allIncludedFeedIds.length === 0) {
      return eq(feedItems.feedId, -1);
    }

    return inArray(feedItems.feedId, allIncludedFeedIds);
  }

  // Regular view - include feeds from categories + directly assigned feeds
  if (feedsForView.length === 0) {
    return eq(feedItems.feedId, -1);
  }

  return inArray(feedItems.feedId, feedsForView);
}

/**
 * Build a Drizzle filter condition for content type filtering
 *
 * Content types:
 * - "all": no filter
 * - "longform": exclude vertical orientation items
 * - "horizontal-video": only video feeds with horizontal orientation
 * - "vertical-video": only video feeds with vertical orientation
 */
export function buildContentFilter(
  contentFilter: ContentFilter | undefined,
): SQL | undefined {
  return contentFilter === undefined
    ? undefined
    : contentFilterSqlPredicate({
        filter: contentFilter,
        contentType: feedItems.contentType,
        orientation: feedItems.orientation,
      });
}

/**
 * Build a Drizzle filter condition for time window filtering
 *
 * Filters items to only those posted within the last N days.
 * If daysWindow is 0 or undefined, no filter is applied (all time).
 */
export function buildTimeWindowFilter(
  daysWindow: number | undefined,
): SQL | undefined {
  if (!daysWindow || daysWindow <= 0) {
    return undefined;
  }

  const now = new Date();
  const cutoffDate = new Date(now);
  cutoffDate.setDate(cutoffDate.getDate() - daysWindow);

  return gte(feedItems.postedAt, cutoffDate);
}
