import { and, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import type { ApplicationBookmark } from "../projection";
import type { db as defaultDatabase } from "~/server/db";
import type { DatabaseBookmark } from "~/server/db/schema";
import { bookmarks, pageCaptures } from "~/server/db/schema";

type MixedContentDatabase = typeof defaultDatabase;

function titleFromUrl(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function parseIds(value: string | null) {
  if (!value) return [];
  return value
    .split(",")
    .map(Number)
    .filter(Number.isInteger)
    .sort((left, right) => left - right);
}

const bookmarkViewIds = sql<string | null>`(
  SELECT GROUP_CONCAT(view_id, ',')
  FROM serial_bookmark_view
  WHERE bookmark_id = serial_bookmark.id
)`;
const bookmarkTagIds = sql<string | null>`(
  SELECT GROUP_CONCAT(tag_id, ',')
  FROM serial_bookmark_tag
  WHERE bookmark_id = serial_bookmark.id
)`;
const captureMetadataColumns = {
  bookmarkId: pageCaptures.bookmarkId,
  title: pageCaptures.title,
  author: pageCaptures.author,
  publishedAt: pageCaptures.publishedAt,
  effectiveUrl: pageCaptures.effectiveUrl,
  iconUrl: pageCaptures.iconUrl,
  representativeImageUrl: pageCaptures.representativeImageUrl,
  contentHash: pageCaptures.contentHash,
  capturedAt: pageCaptures.capturedAt,
};

function mapApplicationBookmark(row: {
  bookmark: DatabaseBookmark;
  capture:
    | {
        [Key in keyof typeof captureMetadataColumns]:
          (typeof pageCaptures.$inferSelect)[Key] | null;
      }
    | null;
  viewIds: string | null;
  tagIds: string | null;
}): ApplicationBookmark {
  return {
    ...row.bookmark,
    title: row.capture?.title || titleFromUrl(row.bookmark.sourceUrl),
    author: row.capture?.author ?? null,
    publishedAt: row.capture?.publishedAt ?? null,
    effectiveUrl: row.capture?.effectiveUrl ?? null,
    iconUrl: row.capture?.iconUrl ?? null,
    representativeImageUrl: row.capture?.representativeImageUrl ?? null,
    captureHash: row.capture?.contentHash ?? null,
    capturedAt: row.capture?.capturedAt ?? null,
    viewIds: parseIds(row.viewIds),
    tagIds: parseIds(row.tagIds),
  };
}

async function queryApplicationBookmarks(input: {
  database: MixedContentDatabase;
  userId: string;
  bookmarkIds?: string[];
}) {
  if (input.bookmarkIds?.length === 0) return [];
  const rows = await input.database
    .select({
      bookmark: getTableColumns(bookmarks),
      capture: captureMetadataColumns,
      viewIds: bookmarkViewIds,
      tagIds: bookmarkTagIds,
    })
    .from(bookmarks)
    .leftJoin(pageCaptures, eq(pageCaptures.bookmarkId, bookmarks.id))
    .where(
      and(
        eq(bookmarks.userId, input.userId),
        input.bookmarkIds
          ? inArray(bookmarks.id, input.bookmarkIds)
          : undefined,
      ),
    );
  return rows.map(mapApplicationBookmark);
}

export function loadApplicationBookmarks(input: {
  database: MixedContentDatabase;
  userId: string;
}): Promise<ApplicationBookmark[]> {
  return queryApplicationBookmarks(input);
}

export function loadApplicationBookmarksById(input: {
  database: MixedContentDatabase;
  userId: string;
  bookmarkIds: string[];
}): Promise<ApplicationBookmark[]> {
  return queryApplicationBookmarks(input);
}
