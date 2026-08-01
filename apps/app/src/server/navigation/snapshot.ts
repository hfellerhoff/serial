import { and, eq, exists, not, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { db as defaultDatabase } from "~/server/db";
import type { VisibilityFilter } from "~/lib/data/atoms";
import { INBOX_VIEW_ID } from "~/lib/data/views/constants";
import { contentFilterColumnAllowsDescriptor } from "~/lib/views/contentFilter";
import {
  bookmarks,
  bookmarkTags,
  bookmarkViews,
  contentCategories,
  feedCategories,
  feedItems,
  feeds,
  user,
  viewCategories,
  viewFeeds,
  views,
} from "~/server/db/schema";
import {
  bookmarkScopeCondition,
  feedScopeCondition,
} from "~/server/mixed-content/projection/scope";

type NavigationDatabase = typeof defaultDatabase;
type SqlColumn = Parameters<typeof eq>[0];

export type NavigationAvailability = Record<VisibilityFilter, boolean>;

export type NavigationSnapshot = {
  views: Record<number, NavigationAvailability>;
  tags: Record<number, NavigationAvailability>;
  feeds: Record<number, NavigationAvailability>;
};

type AvailabilityRow = {
  id: number;
  unread: number;
  read: number;
  later: number;
};

function visibilityCondition(input: {
  visibility: VisibilityFilter;
  isRead: SqlColumn;
  isLater: SqlColumn;
}) {
  if (input.visibility === "later") return eq(input.isLater, true);
  return and(
    eq(input.isLater, false),
    eq(input.isRead, input.visibility === "read"),
  );
}

function hasAny(condition: SQL | undefined) {
  return sql<number>`CASE WHEN ${condition ?? sql`0`} THEN 1 ELSE 0 END`;
}

function availabilityRecord(rows: AvailabilityRow[]) {
  return Object.fromEntries(
    rows.map((row) => [
      row.id,
      {
        unread: Boolean(row.unread),
        read: Boolean(row.read),
        later: Boolean(row.later),
      },
    ]),
  ) as Record<number, NavigationAvailability>;
}

function canonicalBookmarkExists(database: NavigationDatabase, userId: string) {
  const normalizedFeedUrl = sql<string>`COALESCE(
    ${feedItems.normalizedUrl},
    ${feedItems.url}
  )`;
  return exists(
    database
      .select({ value: sql<number>`1` })
      .from(bookmarks)
      .where(
        and(
          eq(bookmarks.userId, userId),
          eq(bookmarks.canonicalUrl, normalizedFeedUrl),
        ),
      ),
  );
}

function feedExistsForView(input: {
  database: NavigationDatabase;
  userId: string;
  visibility: VisibilityFilter;
  now: Date;
}) {
  const directMembership = exists(
    input.database
      .select({ value: sql<number>`1` })
      .from(viewFeeds)
      .where(
        and(
          eq(viewFeeds.viewId, views.id),
          eq(viewFeeds.feedId, feedItems.feedId),
        ),
      ),
  );
  const tagMembership = exists(
    input.database
      .select({ value: sql<number>`1` })
      .from(feedCategories)
      .innerJoin(
        viewCategories,
        eq(viewCategories.categoryId, feedCategories.categoryId),
      )
      .where(
        and(
          eq(viewCategories.viewId, views.id),
          eq(feedCategories.feedId, feedItems.feedId),
        ),
      ),
  );
  const nowSeconds = Math.floor(input.now.getTime() / 1000);
  const insideTimeWindow = or(
    eq(views.daysWindow, 0),
    sql`${feedItems.postedAt} >= (${nowSeconds} - (${views.daysWindow} * 86400))`,
  );

  return exists(
    input.database
      .select({ value: sql<number>`1` })
      .from(feedItems)
      .innerJoin(feeds, eq(feeds.id, feedItems.feedId))
      .where(
        and(
          eq(feeds.userId, input.userId),
          or(directMembership, tagMembership),
          contentFilterColumnAllowsDescriptor({
            filter: views.contentFilter,
            contentType: feedItems.contentType,
            orientation: feedItems.orientation,
          }),
          insideTimeWindow,
          visibilityCondition({
            visibility: input.visibility,
            isRead: feedItems.isWatched,
            isLater: feedItems.isWatchLater,
          }),
          not(canonicalBookmarkExists(input.database, input.userId)),
        ),
      ),
  );
}

function bookmarkExistsForView(input: {
  database: NavigationDatabase;
  userId: string;
  visibility: VisibilityFilter;
  now: Date;
}) {
  const directMembership = exists(
    input.database
      .select({ value: sql<number>`1` })
      .from(bookmarkViews)
      .where(
        and(
          eq(bookmarkViews.viewId, views.id),
          eq(bookmarkViews.bookmarkId, bookmarks.id),
        ),
      ),
  );
  const tagMembership = exists(
    input.database
      .select({ value: sql<number>`1` })
      .from(bookmarkTags)
      .innerJoin(
        viewCategories,
        eq(viewCategories.categoryId, bookmarkTags.tagId),
      )
      .where(
        and(
          eq(viewCategories.viewId, views.id),
          eq(bookmarkTags.bookmarkId, bookmarks.id),
        ),
      ),
  );
  const nowSeconds = Math.floor(input.now.getTime() / 1000);
  const insideTimeWindow = or(
    eq(views.daysWindow, 0),
    sql`${bookmarks.createdAt} >= (${nowSeconds} - (${views.daysWindow} * 86400))`,
  );

  return exists(
    input.database
      .select({ value: sql<number>`1` })
      .from(bookmarks)
      .where(
        and(
          eq(bookmarks.userId, input.userId),
          or(directMembership, tagMembership),
          contentFilterColumnAllowsDescriptor({
            filter: views.contentFilter,
            contentType: bookmarks.contentType,
            orientation: bookmarks.orientation,
          }),
          insideTimeWindow,
          visibilityCondition({
            visibility: input.visibility,
            isRead: bookmarks.isRead,
            isLater: bookmarks.isSaved,
          }),
        ),
      ),
  );
}

async function queryViewAvailability(input: {
  database: NavigationDatabase;
  userId: string;
  now: Date;
}) {
  const visibilityExists = (visibility: VisibilityFilter) =>
    or(
      feedExistsForView({ ...input, visibility }),
      bookmarkExistsForView({ ...input, visibility }),
    );
  const customViewRows = await input.database
    .select({
      id: views.id,
      unread: hasAny(visibilityExists("unread")),
      read: hasAny(visibilityExists("read")),
      later: hasAny(visibilityExists("later")),
    })
    .from(views)
    .where(eq(views.userId, input.userId));

  const inboxScope = {
    database: input.database,
    userId: input.userId,
    scope: { type: "view" as const, viewId: INBOX_VIEW_ID },
    scopeData: {
      valid: true,
      targetView: null,
      categoryIds: [],
      directFeedIds: [],
      sections: [],
    },
  };
  const inboxVisibilityExists = (visibility: VisibilityFilter) =>
    or(
      exists(
        input.database
          .select({ value: sql<number>`1` })
          .from(feedItems)
          .innerJoin(feeds, eq(feeds.id, feedItems.feedId))
          .where(
            and(
              eq(feeds.userId, input.userId),
              feedScopeCondition(inboxScope),
              visibilityCondition({
                visibility,
                isRead: feedItems.isWatched,
                isLater: feedItems.isWatchLater,
              }),
              not(canonicalBookmarkExists(input.database, input.userId)),
            ),
          ),
      ),
      exists(
        input.database
          .select({ value: sql<number>`1` })
          .from(bookmarks)
          .where(
            and(
              eq(bookmarks.userId, input.userId),
              bookmarkScopeCondition(inboxScope),
              visibilityCondition({
                visibility,
                isRead: bookmarks.isRead,
                isLater: bookmarks.isSaved,
              }),
            ),
          ),
      ),
    );
  const inboxRows = await input.database
    .select({
      id: sql<number>`${INBOX_VIEW_ID}`,
      unread: hasAny(inboxVisibilityExists("unread")),
      read: hasAny(inboxVisibilityExists("read")),
      later: hasAny(inboxVisibilityExists("later")),
    })
    .from(user)
    .where(eq(user.id, input.userId))
    .limit(1);

  return availabilityRecord([...customViewRows, ...inboxRows]);
}

async function queryTagAvailability(input: {
  database: NavigationDatabase;
  userId: string;
}) {
  const feedExistsForTag = (visibility: VisibilityFilter) =>
    exists(
      input.database
        .select({ value: sql<number>`1` })
        .from(feedCategories)
        .innerJoin(feeds, eq(feeds.id, feedCategories.feedId))
        .innerJoin(feedItems, eq(feedItems.feedId, feeds.id))
        .where(
          and(
            eq(feeds.userId, input.userId),
            eq(feedCategories.categoryId, contentCategories.id),
            visibilityCondition({
              visibility,
              isRead: feedItems.isWatched,
              isLater: feedItems.isWatchLater,
            }),
            not(canonicalBookmarkExists(input.database, input.userId)),
          ),
        ),
    );
  const bookmarkExistsForTag = (visibility: VisibilityFilter) =>
    exists(
      input.database
        .select({ value: sql<number>`1` })
        .from(bookmarkTags)
        .innerJoin(bookmarks, eq(bookmarks.id, bookmarkTags.bookmarkId))
        .where(
          and(
            eq(bookmarks.userId, input.userId),
            eq(bookmarkTags.tagId, contentCategories.id),
            visibilityCondition({
              visibility,
              isRead: bookmarks.isRead,
              isLater: bookmarks.isSaved,
            }),
          ),
        ),
    );
  const visibilityExists = (visibility: VisibilityFilter) =>
    or(feedExistsForTag(visibility), bookmarkExistsForTag(visibility));

  const rows = await input.database
    .select({
      id: contentCategories.id,
      unread: hasAny(visibilityExists("unread")),
      read: hasAny(visibilityExists("read")),
      later: hasAny(visibilityExists("later")),
    })
    .from(contentCategories)
    .where(eq(contentCategories.userId, input.userId));
  return availabilityRecord(rows);
}

async function queryFeedAvailability(input: {
  database: NavigationDatabase;
  userId: string;
}) {
  const visibilityExists = (visibility: VisibilityFilter) =>
    exists(
      input.database
        .select({ value: sql<number>`1` })
        .from(feedItems)
        .where(
          and(
            eq(feedItems.feedId, feeds.id),
            visibilityCondition({
              visibility,
              isRead: feedItems.isWatched,
              isLater: feedItems.isWatchLater,
            }),
          ),
        ),
    );
  const rows = await input.database
    .select({
      id: feeds.id,
      unread: hasAny(visibilityExists("unread")),
      read: hasAny(visibilityExists("read")),
      later: hasAny(visibilityExists("later")),
    })
    .from(feeds)
    .where(eq(feeds.userId, input.userId));
  return availabilityRecord(rows);
}

export async function queryNavigationSnapshot(input: {
  database: NavigationDatabase;
  userId: string;
  now?: Date;
}): Promise<NavigationSnapshot> {
  const now = input.now ?? new Date();
  const [viewAvailability, tagAvailability, feedAvailability] =
    await Promise.all([
      queryViewAvailability({ ...input, now }),
      queryTagAvailability(input),
      queryFeedAvailability(input),
    ]);
  return {
    views: viewAvailability,
    tags: tagAvailability,
    feeds: feedAvailability,
  };
}
