import { and, asc, eq } from "drizzle-orm";
import type { db as defaultDatabase } from "~/server/db";
import type { ApplicationBookmark } from "~/server/mixed-content/projection";
import { VIEW_LAYOUT_ITEM_TYPE } from "~/server/db/constants";
import { contentCategories, views, viewSections } from "~/server/db/schema";
import { loadApplicationBookmarksById } from "~/server/mixed-content/projection";

type ExtensionWorkspaceDatabase = typeof defaultDatabase;

export async function loadExtensionBookmarkWorkspace(input: {
  database: ExtensionWorkspaceDatabase;
  userId: string;
  bookmarkId: string;
  bookmark?: ApplicationBookmark;
}) {
  const [bookmarks, viewRows, tagRows, viewTagRows] = await Promise.all([
    input.bookmark
      ? Promise.resolve([input.bookmark])
      : loadApplicationBookmarksById({
          database: input.database,
          userId: input.userId,
          bookmarkIds: [input.bookmarkId],
        }),
    input.database
      .select({ id: views.id, name: views.name })
      .from(views)
      .where(eq(views.userId, input.userId))
      .orderBy(asc(views.name)),
    input.database
      .select({ id: contentCategories.id, name: contentCategories.name })
      .from(contentCategories)
      .where(eq(contentCategories.userId, input.userId))
      .orderBy(asc(contentCategories.name)),
    input.database
      .select({ viewId: viewSections.viewId, tagId: viewSections.itemId })
      .from(viewSections)
      .innerJoin(views, eq(views.id, viewSections.viewId))
      .where(
        and(
          eq(views.userId, input.userId),
          eq(viewSections.itemType, VIEW_LAYOUT_ITEM_TYPE.TAG),
        ),
      ),
  ]);
  const bookmark = bookmarks[0];
  if (!bookmark) return null;
  const tagIdsByView = new Map<number, number[]>();
  for (const row of viewTagRows) {
    tagIdsByView.set(row.viewId, [
      ...(tagIdsByView.get(row.viewId) ?? []),
      row.tagId,
    ]);
  }
  return {
    bookmark,
    views: viewRows.map((view) => ({
      ...view,
      tagIds: tagIdsByView.get(view.id) ?? [],
    })),
    tags: tagRows,
  };
}
