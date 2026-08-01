import type {
  ApplicationView,
  DatabaseContentCategory,
} from "~/server/db/schema";
import {
  INBOX_VIEW_ID,
  INBOX_VIEW_PLACEMENT,
} from "~/lib/data/views/constants";
import { VIEW_LAYOUT, VIEW_READ_STATUS } from "~/server/db/constants";
import { DEFAULT_CONTENT_FILTER } from "~/lib/views/contentFilter";

export function buildUncategorizedView(
  userId: string,
  contentCategoriesList: DatabaseContentCategory[],
  customViews: ApplicationView[],
): ApplicationView {
  const allCategoryIdsSet = new Set(
    contentCategoriesList.map((category) => category.id),
  );
  const customViewCategoryIdsSet = new Set(
    customViews.flatMap((view) => view.categoryIds),
  );

  const uncategorizedCategoryIds = [...allCategoryIdsSet].filter(
    (id) => !customViewCategoryIdsSet.has(id),
  );

  const now = new Date();

  return {
    id: INBOX_VIEW_ID,
    name: "Uncategorized",
    daysWindow: 0,
    contentFilter: DEFAULT_CONTENT_FILTER,
    layout: VIEW_LAYOUT.LIST,
    readStatus: VIEW_READ_STATUS.UNREAD,
    placement: INBOX_VIEW_PLACEMENT,
    userId,
    createdAt: now,
    updatedAt: now,
    categoryIds: uncategorizedCategoryIds,
    feedIds: [],
    viewSections: [],
    isDefault: true,
  };
}
