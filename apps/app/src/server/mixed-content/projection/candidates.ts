import {
  and,
  asc,
  desc,
  eq,
  exists,
  getTableColumns,
  gt,
  lt,
  not,
  or,
  sql,
} from "drizzle-orm";
import { bookmarkScopeCondition, feedScopeCondition } from "./scope";
import type { SQL } from "drizzle-orm";
import type {
  MixedContentCursor,
  MixedContentEntityKind,
  MixedContentScope,
} from "../projection";
import type { ScopeData } from "./scope";
import type { VisibilityFilter } from "~/lib/data/atoms";
import type { db as defaultDatabase } from "~/server/db";
import type { ApplicationFeedItem } from "~/server/db/schema";
import { bookmarks, feedItems, feeds } from "~/server/db/schema";

const UNCATEGORIZED_SECTION_PLACEMENT = 999_999;

type MixedContentDatabase = typeof defaultDatabase;

export type FeedCandidate = {
  entityKind: "feed-item";
  entityId: string;
  item: ApplicationFeedItem;
  sectionPlacement: number | null;
  normalizedAt: Date;
};

export type BookmarkCandidate = {
  entityKind: "bookmark";
  entityId: string;
  sectionPlacement: number | null;
  normalizedAt: Date;
};

export type Candidate = FeedCandidate | BookmarkCandidate;

const applicationFeedItemColumns = { ...getTableColumns(feedItems) };
Reflect.deleteProperty(applicationFeedItemColumns, "canonicalUrl");

function bookmarkVisibilityCondition(visibility: VisibilityFilter) {
  if (visibility === "later") return eq(bookmarks.isSaved, true);
  return and(
    eq(bookmarks.isSaved, false),
    eq(bookmarks.isRead, visibility === "read"),
  );
}

function feedVisibilityCondition(visibility: VisibilityFilter) {
  if (visibility === "later") return eq(feedItems.isWatchLater, true);
  return and(
    eq(feedItems.isWatchLater, false),
    eq(feedItems.isWatched, visibility === "read"),
  );
}

function bookmarkTimeExpression(visibility: VisibilityFilter) {
  if (visibility === "later") return sql<number>`${bookmarks.savedUpdatedAt}`;
  if (visibility === "read") return sql<number>`${bookmarks.readUpdatedAt}`;
  return sql<number>`${bookmarks.createdAt}`;
}

function feedTimeExpression(visibility: VisibilityFilter) {
  if (visibility === "later") {
    return sql<number>`COALESCE(${feedItems.isWatchLaterUpdatedAt}, ${feedItems.postedAt})`;
  }
  if (visibility === "read") {
    return sql<number>`COALESCE(${feedItems.isWatchedUpdatedAt}, ${feedItems.postedAt})`;
  }
  return sql<number>`${feedItems.postedAt}`;
}

function qualifiedColumn(table: unknown, column: { name: string }) {
  const tableName = (table as Record<symbol, string>)[
    Symbol.for("drizzle:Name")
  ];
  // Both identifiers come from static Drizzle schema metadata, not input.
  // react-doctor-disable-next-line react-doctor/raw-sql-injection-risk
  return sql.raw(`"${tableName}"."${column.name}"`);
}

function feedSectionPlacement(viewId: number) {
  const feedId = qualifiedColumn(feedItems, feedItems.feedId);
  return sql<number>`COALESCE(
    (
      SELECT MIN(placement)
      FROM serial_view_sections
      WHERE view_id = ${viewId}
        AND item_type = 'feed'
        AND item_id = ${feedId}
    ),
    (
      SELECT MIN(placement)
      FROM serial_view_sections AS candidate_section
      WHERE view_id = ${viewId}
        AND item_type = 'tag'
        AND EXISTS (
          SELECT 1
          FROM serial_feed_categories
          WHERE feed_id = ${feedId}
            AND category_id = candidate_section.item_id
        )
    ),
    ${UNCATEGORIZED_SECTION_PLACEMENT}
  )`;
}

function bookmarkSectionPlacement(viewId: number) {
  const bookmarkId = qualifiedColumn(bookmarks, bookmarks.id);
  return sql<number>`COALESCE(
    (
      SELECT MIN(candidate_section.placement)
      FROM serial_view_sections AS candidate_section
      INNER JOIN serial_bookmark_tag
        ON serial_bookmark_tag.tag_id = candidate_section.item_id
      WHERE candidate_section.view_id = ${viewId}
        AND candidate_section.item_type = 'tag'
        AND serial_bookmark_tag.bookmark_id = ${bookmarkId}
    ),
    ${UNCATEGORIZED_SECTION_PLACEMENT}
  )`;
}

function cursorCondition(input: {
  cursor: MixedContentCursor | undefined;
  placement: SQL<number>;
  normalizedAt: SQL<number>;
  entityKind: MixedContentEntityKind;
  entityId: typeof bookmarks.id | typeof feedItems.id;
}) {
  const { cursor, placement, normalizedAt, entityKind, entityId } = input;
  if (!cursor) return undefined;
  const cursorPlacement = cursor.sectionPlacement ?? 0;
  const cursorTime = cursor.normalizedAt.getTime();
  const kindOrder = entityKind === "bookmark" ? 0 : 1;
  const cursorKindOrder = cursor.entityKind === "bookmark" ? 0 : 1;
  const idTie =
    kindOrder > cursorKindOrder
      ? sql`1`
      : kindOrder === cursorKindOrder
        ? lt(entityId, cursor.entityId)
        : sql`0`;
  return or(
    gt(placement, cursorPlacement),
    and(eq(placement, cursorPlacement), sql`${normalizedAt} < ${cursorTime}`),
    and(
      eq(placement, cursorPlacement),
      sql`${normalizedAt} = ${cursorTime}`,
      idTie,
    ),
  );
}

export async function queryBookmarkCandidates(input: {
  database: MixedContentDatabase;
  userId: string;
  scope: MixedContentScope;
  scopeData: ScopeData;
  visibility: VisibilityFilter;
  cursor?: MixedContentCursor;
  limit: number;
  hasSections: boolean;
}): Promise<BookmarkCandidate[]> {
  const normalizedAt = bookmarkTimeExpression(input.visibility);
  const placement = input.hasSections
    ? bookmarkSectionPlacement((input.scope as { viewId: number }).viewId)
    : sql<number>`CAST(0 AS INTEGER)`;
  const rows = await input.database
    .select({ id: bookmarks.id, normalizedAt, placement })
    .from(bookmarks)
    .where(
      and(
        eq(bookmarks.userId, input.userId),
        bookmarkVisibilityCondition(input.visibility),
        bookmarkScopeCondition(input),
        cursorCondition({
          cursor: input.cursor,
          placement,
          normalizedAt,
          entityKind: "bookmark",
          entityId: bookmarks.id,
        }),
      ),
    )
    .orderBy(asc(placement), desc(normalizedAt), desc(bookmarks.id))
    .limit(input.limit + 1);
  return rows.map((row) => ({
    entityKind: "bookmark",
    entityId: row.id,
    sectionPlacement: input.hasSections ? row.placement : null,
    normalizedAt: new Date(row.normalizedAt),
  }));
}

export async function queryFeedCandidates(input: {
  database: MixedContentDatabase;
  userId: string;
  scope: MixedContentScope;
  scopeData: ScopeData;
  visibility: VisibilityFilter;
  cursor?: MixedContentCursor;
  limit: number;
  hasSections: boolean;
}): Promise<FeedCandidate[]> {
  const normalizedAt = feedTimeExpression(input.visibility);
  const placement = input.hasSections
    ? feedSectionPlacement((input.scope as { viewId: number }).viewId)
    : sql<number>`CAST(0 AS INTEGER)`;
  const canonicalFeedUrl = sql<string>`COALESCE(
    ${feedItems.canonicalUrl},
    CASE
      WHEN INSTR(${feedItems.url}, '#') > 0
        THEN SUBSTR(${feedItems.url}, 1, INSTR(${feedItems.url}, '#') - 1)
      ELSE ${feedItems.url}
    END
  )`;
  const canonicalBookmark = exists(
    input.database
      .select({ value: sql<number>`1` })
      .from(bookmarks)
      .where(
        and(
          eq(bookmarks.userId, input.userId),
          eq(bookmarks.canonicalUrl, canonicalFeedUrl),
        ),
      ),
  );
  const rows = await input.database
    .select({
      item: applicationFeedItemColumns,
      platform: feeds.platform,
      normalizedAt,
      placement,
    })
    .from(feedItems)
    .innerJoin(feeds, eq(feeds.id, feedItems.feedId))
    .where(
      and(
        eq(feeds.userId, input.userId),
        feedVisibilityCondition(input.visibility),
        feedScopeCondition(input),
        not(canonicalBookmark),
        cursorCondition({
          cursor: input.cursor,
          placement,
          normalizedAt,
          entityKind: "feed-item",
          entityId: feedItems.id,
        }),
      ),
    )
    .orderBy(asc(placement), desc(normalizedAt), desc(feedItems.id))
    .limit(input.limit + 1);
  return rows.map((row) => ({
    entityKind: "feed-item",
    entityId: row.item.id,
    item: { ...row.item, platform: row.platform } as ApplicationFeedItem,
    sectionPlacement: input.hasSections ? row.placement : null,
    normalizedAt: new Date(row.normalizedAt),
  }));
}

export function compareCandidates(left: Candidate, right: Candidate) {
  const placementDifference =
    (left.sectionPlacement ?? 0) - (right.sectionPlacement ?? 0);
  if (placementDifference !== 0) return placementDifference;
  const timeDifference =
    right.normalizedAt.getTime() - left.normalizedAt.getTime();
  if (timeDifference !== 0) return timeDifference;
  const kindDifference = left.entityKind.localeCompare(right.entityKind);
  if (kindDifference !== 0) return kindDifference;
  return right.entityId.localeCompare(left.entityId);
}
