import { and, eq } from "drizzle-orm";
import type { db as defaultDatabase } from "~/server/db";
import { BookmarkNotFoundError } from "~/server/bookmarks/service";
import { bookmarks, contentCategories, views } from "~/server/db/schema";

type ExtensionOrganizationDatabase = typeof defaultDatabase;

async function assertBookmarkOwned(input: {
  database: ExtensionOrganizationDatabase;
  userId: string;
  bookmarkId: string;
}) {
  const bookmark = await input.database.query.bookmarks.findFirst({
    columns: { id: true },
    where: and(
      eq(bookmarks.id, input.bookmarkId),
      eq(bookmarks.userId, input.userId),
    ),
  });
  if (!bookmark) throw new BookmarkNotFoundError("Bookmark not found");
}

export async function createExtensionBookmarkView(input: {
  database: ExtensionOrganizationDatabase;
  userId: string;
  bookmarkId: string;
  name: string;
}) {
  await assertBookmarkOwned(input);
  const [created] = await input.database
    .insert(views)
    .values({ userId: input.userId, name: input.name })
    .returning({ id: views.id, name: views.name });
  if (!created) throw new Error("Unable to create View");
  return { ...created, tagIds: [] as number[] };
}

export async function createExtensionBookmarkTag(input: {
  database: ExtensionOrganizationDatabase;
  userId: string;
  bookmarkId: string;
  name: string;
}) {
  await assertBookmarkOwned(input);
  const [created] = await input.database
    .insert(contentCategories)
    .values({ userId: input.userId, name: input.name })
    .returning({ id: contentCategories.id, name: contentCategories.name });
  if (!created) throw new Error("Unable to create Tag");
  return created;
}
