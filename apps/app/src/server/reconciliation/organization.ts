import { asc, eq, inArray } from "drizzle-orm";
import type { OrganizationSnapshot } from "~/lib/reconciliation";
import type {
  ApplicationFeed,
  ApplicationView,
  DatabaseContentCategory,
  DatabaseFeedCategory,
  DatabaseViewCategory,
  DatabaseViewFeed,
  DatabaseViewSection,
} from "~/server/db/schema";
import type { db as defaultDatabase } from "~/server/db";
import { isFeedCompatibleWithContentFilter } from "~/lib/data/feed-items/filters";
import { UNCATEGORIZED_VIEW_ID } from "~/lib/data/views/constants";
import { sortViewsByPlacement } from "~/lib/data/views/utils";
import { parseArrayOfSchema } from "~/lib/schemas/utils";
import { buildUncategorizedView } from "~/server/api/utils/buildUncategorizedView";
import {
  contentCategories,
  feedCategories,
  feeds,
  feedsSchema,
  viewCategories,
  viewFeeds,
  views,
  viewSections,
} from "~/server/db/schema";

type ReconciliationDatabase = typeof defaultDatabase;

type OrganizationRows = {
  views: Array<typeof views.$inferSelect>;
  feeds: Array<typeof feeds.$inferSelect>;
  tags: DatabaseContentCategory[];
  feedTags: DatabaseFeedCategory[];
  viewTags: DatabaseViewCategory[];
  directViewFeeds: DatabaseViewFeed[];
  viewSections: DatabaseViewSection[];
};

type CustomViewMembership = {
  view: ApplicationView;
  feedIds: Set<number>;
  categoryIds: Set<number>;
};

function buildFeedTagsByFeed(feedTags: DatabaseFeedCategory[]) {
  const result = new Map<number, number[]>();
  for (const assignment of feedTags) {
    result.set(assignment.feedId, [
      ...(result.get(assignment.feedId) ?? []),
      assignment.categoryId,
    ]);
  }
  return result;
}

function buildApplicationViews(userId: string, rows: OrganizationRows) {
  const customViews: ApplicationView[] = rows.views.map((view) => ({
    ...view,
    isDefault: false,
    categoryIds: rows.viewTags.flatMap((assignment) =>
      assignment.viewId === view.id && assignment.categoryId !== null
        ? [assignment.categoryId]
        : [],
    ),
    feedIds: rows.directViewFeeds.flatMap((assignment) =>
      assignment.viewId === view.id ? [assignment.feedId] : [],
    ),
    viewSections: rows.viewSections
      .filter((section) => section.viewId === view.id)
      .map((section) => ({
        ...section,
        itemType: section.itemType as "tag" | "feed",
      })),
  }));
  return {
    customViews,
    allViews: sortViewsByPlacement([
      ...customViews,
      buildUncategorizedView(userId, rows.tags, customViews),
    ]),
  };
}

function effectiveFeedIds(input: {
  view: ApplicationView;
  applicationFeeds: ApplicationFeed[];
  feedTagsByFeed: Map<number, number[]>;
  customMemberships: CustomViewMembership[];
}) {
  const { view, applicationFeeds, feedTagsByFeed, customMemberships } = input;
  const customDirectFeedIds = new Set(
    customMemberships.flatMap(({ view: candidate }) => candidate.feedIds),
  );
  const matching = new Set<number>(
    view.id === UNCATEGORIZED_VIEW_ID ? [] : view.feedIds,
  );

  for (const feed of applicationFeeds) {
    if (matching.has(feed.id)) continue;
    if (!isFeedCompatibleWithContentFilter(feed.platform, view.contentFilter)) {
      continue;
    }
    const tagIds = feedTagsByFeed.get(feed.id) ?? [];
    const tagIdSet = new Set(tagIds);
    if (view.id === UNCATEGORIZED_VIEW_ID) {
      if (customDirectFeedIds.has(feed.id)) continue;
      const belongsToCompatibleCustomView = customMemberships.some(
        (membership) =>
          isFeedCompatibleWithContentFilter(
            feed.platform,
            membership.view.contentFilter,
          ) &&
          (membership.feedIds.has(feed.id) ||
            tagIds.some((id) => membership.categoryIds.has(id))),
      );
      if (!belongsToCompatibleCustomView) matching.add(feed.id);
      continue;
    }
    if (
      (view.feedIds.length === 0 && view.categoryIds.length === 0) ||
      view.categoryIds.some((id) => tagIdSet.has(id))
    ) {
      matching.add(feed.id);
    }
  }
  return [...matching];
}

async function loadOrganizationRows(input: {
  database: ReconciliationDatabase;
  userId: string;
}): Promise<OrganizationRows> {
  const [viewRows, feedRows, tags] = await Promise.all([
    input.database
      .select()
      .from(views)
      .where(eq(views.userId, input.userId))
      .orderBy(asc(views.placement)),
    input.database.query.feeds.findMany({
      where: eq(feeds.userId, input.userId),
    }),
    input.database
      .select()
      .from(contentCategories)
      .where(eq(contentCategories.userId, input.userId))
      .orderBy(asc(contentCategories.name)),
  ]);
  const viewIds = viewRows.map(({ id }) => id);
  const tagIds = tags.map(({ id }) => id);
  const [feedTags, viewTags, directViewFeeds, sectionRows] = await Promise.all([
    tagIds.length > 0
      ? input.database
          .select()
          .from(feedCategories)
          .where(inArray(feedCategories.categoryId, tagIds))
      : Promise.resolve([]),
    viewIds.length > 0
      ? input.database
          .select()
          .from(viewCategories)
          .where(inArray(viewCategories.viewId, viewIds))
      : Promise.resolve([]),
    viewIds.length > 0
      ? input.database
          .select()
          .from(viewFeeds)
          .where(inArray(viewFeeds.viewId, viewIds))
      : Promise.resolve([]),
    viewIds.length > 0
      ? input.database
          .select()
          .from(viewSections)
          .where(inArray(viewSections.viewId, viewIds))
          .orderBy(asc(viewSections.placement))
      : Promise.resolve([]),
  ]);
  return {
    views: viewRows,
    feeds: feedRows,
    tags,
    feedTags,
    viewTags,
    directViewFeeds,
    viewSections: sectionRows,
  };
}

export async function loadOrganizationSnapshot(input: {
  database: ReconciliationDatabase;
  userId: string;
}): Promise<OrganizationSnapshot> {
  const rows = await loadOrganizationRows(input);
  const { customViews, allViews } = buildApplicationViews(input.userId, rows);
  const applicationFeeds = parseArrayOfSchema(rows.feeds, feedsSchema);
  const feedTagsByFeed = buildFeedTagsByFeed(rows.feedTags);
  const customMemberships = customViews.map((view) => ({
    view,
    feedIds: new Set(view.feedIds),
    categoryIds: new Set(view.categoryIds),
  }));
  return {
    views: allViews,
    feeds: applicationFeeds,
    tags: rows.tags,
    feedTags: rows.feedTags,
    directViewFeeds: rows.directViewFeeds,
    effectiveViewFeeds: allViews.map((view) => ({
      viewId: view.id,
      feedIds: effectiveFeedIds({
        view,
        applicationFeeds,
        feedTagsByFeed,
        customMemberships,
      }),
    })),
  };
}
