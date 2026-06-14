import { buildOPML } from "./buildOPML";
import type { OPMLFeedItem, OPMLGroup } from "./buildOPML";
import type {
  ApplicationFeed,
  ApplicationView,
  ApplicationViewSection,
  DatabaseContentCategory,
  DatabaseFeedCategory,
  DatabaseViewFeed,
} from "~/server/db/schema";
import { isFeedCompatibleWithContentType } from "~/lib/data/feed-items/filters";
import { INBOX_VIEW_ID } from "~/lib/data/views/constants";
import { VIEW_LAYOUT_ITEM_TYPE } from "~/server/db/constants";

type BuildViewOPMLInput = {
  feeds: ApplicationFeed[];
  views: ApplicationView[];
  contentCategories: DatabaseContentCategory[];
  feedCategories: DatabaseFeedCategory[];
  viewFeeds: DatabaseViewFeed[];
};

function feedToOPMLItem(
  feed: ApplicationFeed,
  tagNames: string[] = [],
): OPMLFeedItem {
  return {
    title: feed.name || feed.url,
    xmlUrl: feed.url,
    tags: tagNames,
  };
}

function sortOPMLFeedItems(items: OPMLFeedItem[]) {
  return items.sort((a, b) => a.title.localeCompare(b.title));
}

function getCategoryNameById(categories: DatabaseContentCategory[]) {
  const categoryNameById = new Map<number, string>();

  for (const category of categories) {
    categoryNameById.set(category.id, category.name);
  }

  return categoryNameById;
}

function getFeedCategoryIdsByFeedId(feedCategories: DatabaseFeedCategory[]) {
  const categoryIdsByFeedId = new Map<number, Set<number>>();

  for (const feedCategory of feedCategories) {
    const existingCategoryIds = categoryIdsByFeedId.get(feedCategory.feedId);
    if (existingCategoryIds) {
      existingCategoryIds.add(feedCategory.categoryId);
    } else {
      categoryIdsByFeedId.set(
        feedCategory.feedId,
        new Set([feedCategory.categoryId]),
      );
    }
  }

  return categoryIdsByFeedId;
}

function getFeedTagNames(
  feedId: number,
  categoryIdsByFeedId: Map<number, Set<number>>,
  categoryNameById: Map<number, string>,
) {
  const categoryIds = categoryIdsByFeedId.get(feedId);
  if (!categoryIds) return [];

  return [...categoryIds]
    .map((categoryId) => categoryNameById.get(categoryId))
    .filter((name): name is string => !!name)
    .sort((a, b) => a.localeCompare(b));
}

function getBestMatchingSection(
  feed: ApplicationFeed,
  viewSections: ApplicationViewSection[],
  categoryIdsByFeedId: Map<number, Set<number>>,
) {
  const orderedSections = [...viewSections].sort(
    (a, b) => a.placement - b.placement,
  );

  const feedSection = orderedSections.find(
    (section) =>
      section.itemType === VIEW_LAYOUT_ITEM_TYPE.FEED &&
      section.itemId === feed.id,
  );
  if (feedSection) return feedSection;

  const categoryIds = categoryIdsByFeedId.get(feed.id);
  if (!categoryIds) return null;

  return (
    orderedSections.find(
      (section) =>
        section.itemType === VIEW_LAYOUT_ITEM_TYPE.TAG &&
        categoryIds.has(section.itemId),
    ) ?? null
  );
}

function getSectionGroups({
  viewSections,
  sectionItemsByKey,
  feedsById,
  categoryNameById,
}: {
  viewSections: ApplicationViewSection[];
  sectionItemsByKey: Map<string, OPMLFeedItem[]>;
  feedsById: Map<number, ApplicationFeed>;
  categoryNameById: Map<number, string>;
}) {
  return [...viewSections]
    .sort((a, b) => a.placement - b.placement)
    .flatMap((section): OPMLGroup[] => {
      const sectionKey = `${section.itemType}:${section.itemId}`;
      const sectionItems = sectionItemsByKey.get(sectionKey) ?? [];
      const sectionFeed = feedsById.get(section.itemId);
      const sectionName =
        section.itemType === VIEW_LAYOUT_ITEM_TYPE.FEED
          ? sectionFeed
            ? feedToOPMLItem(sectionFeed).title
            : undefined
          : categoryNameById.get(section.itemId);

      if (!sectionName || sectionItems.length === 0) return [];

      const outlineType: OPMLGroup["outlineType"] =
        section.itemType === VIEW_LAYOUT_ITEM_TYPE.FEED ? "feed" : "tag";

      return [
        {
          name: sectionName,
          feeds: sortOPMLFeedItems(sectionItems),
          outlineType,
          feedXmlUrl:
            section.itemType === VIEW_LAYOUT_ITEM_TYPE.FEED
              ? sectionFeed?.url
              : undefined,
        },
      ];
    });
}

export function buildViewOPML(input: BuildViewOPMLInput) {
  const { feeds, views, contentCategories, feedCategories, viewFeeds } = input;
  const feedsById = new Map<number, ApplicationFeed>();
  feeds.forEach((feed) => feedsById.set(feed.id, feed));

  const customViews = views.filter((view) => view.id !== INBOX_VIEW_ID);
  const groups: OPMLGroup[] = [];
  const groupedFeedIds = new Set<number>();
  const categoryNameById = getCategoryNameById(contentCategories);
  const categoryIdsByFeedId = getFeedCategoryIdsByFeedId(feedCategories);

  for (const view of customViews) {
    const feedIdsInView = new Set<number>();

    for (const viewFeed of viewFeeds) {
      if (viewFeed.viewId === view.id) {
        feedIdsInView.add(viewFeed.feedId);
      }
    }

    const hasExplicitFeedSelection =
      view.feedIds.length > 0 || feedIdsInView.size > 0;

    if (view.categoryIds.length > 0) {
      const categorySet = new Set(view.categoryIds);
      for (const feedCategory of feedCategories) {
        if (categorySet.has(feedCategory.categoryId)) {
          feedIdsInView.add(feedCategory.feedId);
        }
      }
    } else if (!hasExplicitFeedSelection) {
      for (const feed of feeds) {
        feedIdsInView.add(feed.id);
      }
    }

    const items: OPMLFeedItem[] = [];
    const sectionItemsByKey = new Map<string, OPMLFeedItem[]>();

    for (const feedId of feedIdsInView) {
      const feed = feedsById.get(feedId);
      if (!feed) continue;
      if (!isFeedCompatibleWithContentType(feed.platform, view.contentType)) {
        continue;
      }

      const opmlItem = feedToOPMLItem(
        feed,
        getFeedTagNames(feed.id, categoryIdsByFeedId, categoryNameById),
      );
      const matchingSection = getBestMatchingSection(
        feed,
        view.viewSections,
        categoryIdsByFeedId,
      );

      if (matchingSection) {
        const sectionKey = `${matchingSection.itemType}:${matchingSection.itemId}`;
        const sectionItems = sectionItemsByKey.get(sectionKey);
        if (sectionItems) {
          sectionItems.push(opmlItem);
        } else {
          sectionItemsByKey.set(sectionKey, [opmlItem]);
        }
      } else {
        items.push(opmlItem);
      }

      groupedFeedIds.add(feedId);
    }

    const sectionGroups = getSectionGroups({
      viewSections: view.viewSections,
      sectionItemsByKey,
      feedsById,
      categoryNameById,
    });

    if (items.length > 0 || sectionGroups.length > 0) {
      groups.push({
        name: view.name,
        feeds: sortOPMLFeedItems(items),
        groups: sectionGroups,
        outlineType: "view",
      });
    }
  }

  const ungroupedFeeds = feeds
    .filter((feed) => !groupedFeedIds.has(feed.id))
    .map((feed) =>
      feedToOPMLItem(
        feed,
        getFeedTagNames(feed.id, categoryIdsByFeedId, categoryNameById),
      ),
    )
    .sort((a, b) => a.title.localeCompare(b.title));

  return buildOPML({ groups, ungroupedFeeds });
}
