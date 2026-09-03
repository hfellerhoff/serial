import { asc, eq, inArray } from "drizzle-orm";
import type { ApplicationView } from "~/server/db/schema";
import type { db as defaultDatabase } from "~/server/db";
import { sortViewsByPlacement } from "~/lib/data/views/utils";
import { buildUncategorizedView } from "~/server/api/utils/buildUncategorizedView";
import {
  contentCategories,
  viewCategories,
  viewFeeds,
  views,
  viewSections,
} from "~/server/db/schema";

type Database = typeof defaultDatabase;

/**
 * Load the user's full view list (custom views plus the synthetic
 * Uncategorized view) in the shape the client views store consumes.
 */
export async function loadApplicationViews(
  database: Database,
  userId: string,
): Promise<ApplicationView[]> {
  const [viewsList, contentCategoriesList] = await Promise.all([
    database
      .select()
      .from(views)
      .where(eq(views.userId, userId))
      .orderBy(asc(views.placement)),
    database
      .select()
      .from(contentCategories)
      .where(eq(contentCategories.userId, userId)),
  ]);

  // Fetch view categories, view feeds, and view sections filtered by user's views
  const userViewIds = viewsList.map((v) => v.id);
  const [viewCategoriesList, viewFeedsList, viewSectionsList] =
    userViewIds.length > 0
      ? await Promise.all([
          database
            .select()
            .from(viewCategories)
            .where(inArray(viewCategories.viewId, userViewIds)),
          database
            .select()
            .from(viewFeeds)
            .where(inArray(viewFeeds.viewId, userViewIds)),
          database
            .select()
            .from(viewSections)
            .where(inArray(viewSections.viewId, userViewIds))
            .orderBy(asc(viewSections.placement)),
        ])
      : [[], [], []];

  const categoryIdsByViewId = new Map<number, number[]>();
  for (const association of viewCategoriesList) {
    if (association.viewId === null || association.categoryId === null)
      continue;
    const categoryIds = categoryIdsByViewId.get(association.viewId) ?? [];
    categoryIds.push(association.categoryId);
    categoryIdsByViewId.set(association.viewId, categoryIds);
  }
  const feedIdsByViewId = new Map<number, number[]>();
  for (const association of viewFeedsList) {
    const feedIds = feedIdsByViewId.get(association.viewId) ?? [];
    feedIds.push(association.feedId);
    feedIdsByViewId.set(association.viewId, feedIds);
  }
  const sectionsByViewId = new Map<number, ApplicationView["viewSections"]>();
  for (const section of viewSectionsList) {
    const sections = sectionsByViewId.get(section.viewId) ?? [];
    sections.push({
      ...section,
      itemType: section.itemType as "tag" | "feed",
    });
    sectionsByViewId.set(section.viewId, sections);
  }

  const customViews: ApplicationView[] = viewsList.map((view) => ({
    ...view,
    isDefault: false,
    categoryIds: categoryIdsByViewId.get(view.id) ?? [],
    feedIds: feedIdsByViewId.get(view.id) ?? [],
    viewSections: sectionsByViewId.get(view.id) ?? [],
  }));

  const uncategorizedView = buildUncategorizedView(
    userId,
    contentCategoriesList,
    customViews,
  );

  return sortViewsByPlacement([...customViews, uncategorizedView]);
}
