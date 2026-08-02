import { asc, eq } from "drizzle-orm";
import type { db as defaultDatabase } from "~/server/db";
import type { ApplicationBookmark } from "~/server/mixed-content/projection";
import { contentCategories, views } from "~/server/db/schema";
import { loadApplicationBookmarksById } from "~/server/mixed-content/projection";

type ExtensionWorkspaceDatabase = typeof defaultDatabase;

export async function loadExtensionBookmarkWorkspace(input: {
  database: ExtensionWorkspaceDatabase;
  userId: string;
  bookmarkId: string;
  bookmark?: ApplicationBookmark;
}) {
  const [bookmarks, viewRows, tagRows] = await Promise.all([
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
  ]);
  const bookmark = bookmarks[0];
  if (!bookmark) return null;
  return { bookmark, views: viewRows, tags: tagRows };
}
