import { and, eq, exists, inArray, not, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { db as defaultDatabase } from "~/server/db";
import type {
  ContentAvailability,
  ContentStatusFilter,
} from "~/lib/content-status";
import {
  INBOX_ARCHIVED_CONTENT_STATUS,
  INBOX_UNREAD_CONTENT_STATUS,
  SAVED_ARCHIVED_CONTENT_STATUS,
  SAVED_UNREAD_CONTENT_STATUS,
} from "~/lib/content-status";
import { UNCATEGORIZED_VIEW_ID } from "~/lib/data/views/constants";
import { VIDEO_PLATFORMS } from "~/lib/data/feed-items/filters";
import {
  CONTENT_FILTER_OPTION,
  contentFilterColumnAllowsDescriptor,
  contentFilterColumnHasOption,
} from "~/lib/views/contentFilter";
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

export type NavigationAvailability = ContentAvailability;

export type NavigationSnapshot = {
  views: Record<number, NavigationAvailability>;
  tags: Record<number, NavigationAvailability>;
  feeds: Record<number, NavigationAvailability>;
  viewFeeds: Record<number, Record<number, NavigationAvailability>>;
};

type AvailabilityRow = {
  id: number;
  inboxUnread: number;
  inboxArchived: number;
  savedUnread: number;
  savedArchived: number;
};

type ViewFeedAvailabilityRow = AvailabilityRow & {
  viewId: number;
  feedId: number;
};

function contentStatusCondition(input: {
  contentStatus: ContentStatusFilter;
  isRead: SqlColumn;
  isLater: SqlColumn;
}) {
  return and(
    eq(input.isLater, input.contentStatus.saveStatus === "saved"),
    eq(input.isRead, input.contentStatus.archiveStatus === "archived"),
  );
}

function hasAny(condition: SQL | undefined) {
  return sql<number>`CASE WHEN ${condition ?? sql`0`} THEN 1 ELSE 0 END`;
}

function availabilitySelection(
  contentStatusExists: (contentStatus: ContentStatusFilter) => SQL | undefined,
) {
  return {
    inboxUnread: hasAny(contentStatusExists(INBOX_UNREAD_CONTENT_STATUS)),
    inboxArchived: hasAny(contentStatusExists(INBOX_ARCHIVED_CONTENT_STATUS)),
    savedUnread: hasAny(contentStatusExists(SAVED_UNREAD_CONTENT_STATUS)),
    savedArchived: hasAny(contentStatusExists(SAVED_ARCHIVED_CONTENT_STATUS)),
  };
}

function availabilityRecord(rows: AvailabilityRow[]) {
  return Object.fromEntries(
    rows.map((row) => [
      row.id,
      {
        inbox: {
          unread: Boolean(row.inboxUnread),
          archived: Boolean(row.inboxArchived),
        },
        saved: {
          unread: Boolean(row.savedUnread),
          archived: Boolean(row.savedArchived),
        },
      },
    ]),
  ) as Record<number, NavigationAvailability>;
}

function feedCompatibleWithView() {
  return or(
    and(
      eq(feeds.platform, "website"),
      contentFilterColumnHasOption(
        views.contentFilter,
        CONTENT_FILTER_OPTION.TEXT,
      ),
    ),
    and(
      inArray(feeds.platform, [...VIDEO_PLATFORMS]),
      or(
        contentFilterColumnHasOption(
          views.contentFilter,
          CONTENT_FILTER_OPTION.VIDEOS,
        ),
        contentFilterColumnHasOption(
          views.contentFilter,
          CONTENT_FILTER_OPTION.SHORTS,
        ),
      ),
    ),
  );
}

function feedExistsForViewFeed(input: {
  database: NavigationDatabase;
  userId: string;
  contentStatus: ContentStatusFilter;
  now: Date;
}) {
  const nowSeconds = Math.floor(input.now.getTime() / 1000);
  const insideTimeWindow = or(
    eq(views.daysWindow, 0),
    sql`${feedItems.postedAt} >= (${nowSeconds} - (${views.daysWindow} * 86400))`,
  );

  return exists(
    input.database
      .select({ value: sql<number>`1` })
      .from(feedItems)
      .where(
        and(
          eq(feedItems.feedId, feeds.id),
          contentFilterColumnAllowsDescriptor({
            filter: views.contentFilter,
            contentType: feedItems.contentType,
            orientation: feedItems.orientation,
          }),
          insideTimeWindow,
          contentStatusCondition({
            contentStatus: input.contentStatus,
            isRead: feedItems.isWatched,
            isLater: feedItems.isWatchLater,
          }),
        ),
      ),
  );
}

function feedExistsForView(input: {
  database: NavigationDatabase;
  userId: string;
  contentStatus: ContentStatusFilter;
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
          contentStatusCondition({
            contentStatus: input.contentStatus,
            isRead: feedItems.isWatched,
            isLater: feedItems.isWatchLater,
          }),
        ),
      ),
  );
}

function bookmarkExistsForView(input: {
  database: NavigationDatabase;
  userId: string;
  contentStatus: ContentStatusFilter;
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
          contentStatusCondition({
            contentStatus: input.contentStatus,
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
  const contentStatusExists = (contentStatus: ContentStatusFilter) =>
    or(
      feedExistsForView({ ...input, contentStatus }),
      bookmarkExistsForView({ ...input, contentStatus }),
    );
  const customViewRows = await input.database
    .select({
      id: views.id,
      ...availabilitySelection(contentStatusExists),
    })
    .from(views)
    .where(eq(views.userId, input.userId));

  const uncategorizedScope = {
    database: input.database,
    userId: input.userId,
    scope: { type: "view" as const, viewId: UNCATEGORIZED_VIEW_ID },
    scopeData: {
      valid: true,
      targetView: null,
      categoryIds: [],
      directFeedIds: [],
      sections: [],
    },
  };
  const uncategorizedContentStatusExists = (
    contentStatus: ContentStatusFilter,
  ) =>
    or(
      exists(
        input.database
          .select({ value: sql<number>`1` })
          .from(feedItems)
          .innerJoin(feeds, eq(feeds.id, feedItems.feedId))
          .where(
            and(
              eq(feeds.userId, input.userId),
              feedScopeCondition(uncategorizedScope),
              contentStatusCondition({
                contentStatus,
                isRead: feedItems.isWatched,
                isLater: feedItems.isWatchLater,
              }),
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
              bookmarkScopeCondition(uncategorizedScope),
              contentStatusCondition({
                contentStatus,
                isRead: bookmarks.isRead,
                isLater: bookmarks.isSaved,
              }),
            ),
          ),
      ),
    );
  const uncategorizedRows = await input.database
    .select({
      id: sql<number>`${UNCATEGORIZED_VIEW_ID}`,
      ...availabilitySelection(uncategorizedContentStatusExists),
    })
    .from(user)
    .where(eq(user.id, input.userId))
    .limit(1);

  return availabilityRecord([...customViewRows, ...uncategorizedRows]);
}

async function queryTagAvailability(input: {
  database: NavigationDatabase;
  userId: string;
}) {
  const feedExistsForTag = (contentStatus: ContentStatusFilter) =>
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
            contentStatusCondition({
              contentStatus,
              isRead: feedItems.isWatched,
              isLater: feedItems.isWatchLater,
            }),
          ),
        ),
    );
  const bookmarkExistsForTag = (contentStatus: ContentStatusFilter) =>
    exists(
      input.database
        .select({ value: sql<number>`1` })
        .from(bookmarkTags)
        .innerJoin(bookmarks, eq(bookmarks.id, bookmarkTags.bookmarkId))
        .where(
          and(
            eq(bookmarks.userId, input.userId),
            eq(bookmarkTags.tagId, contentCategories.id),
            contentStatusCondition({
              contentStatus,
              isRead: bookmarks.isRead,
              isLater: bookmarks.isSaved,
            }),
          ),
        ),
    );
  const contentStatusExists = (contentStatus: ContentStatusFilter) =>
    or(feedExistsForTag(contentStatus), bookmarkExistsForTag(contentStatus));

  const rows = await input.database
    .select({
      id: contentCategories.id,
      ...availabilitySelection(contentStatusExists),
    })
    .from(contentCategories)
    .where(eq(contentCategories.userId, input.userId));
  return availabilityRecord(rows);
}

async function queryFeedAvailability(input: {
  database: NavigationDatabase;
  userId: string;
}) {
  const contentStatusExists = (contentStatus: ContentStatusFilter) =>
    exists(
      input.database
        .select({ value: sql<number>`1` })
        .from(feedItems)
        .where(
          and(
            eq(feedItems.feedId, feeds.id),
            contentStatusCondition({
              contentStatus,
              isRead: feedItems.isWatched,
              isLater: feedItems.isWatchLater,
            }),
          ),
        ),
    );
  const rows = await input.database
    .select({
      id: feeds.id,
      ...availabilitySelection(contentStatusExists),
    })
    .from(feeds)
    .where(eq(feeds.userId, input.userId));
  return availabilityRecord(rows);
}

function buildUncategorizedScope(database: NavigationDatabase, userId: string) {
  return {
    database,
    userId,
    scope: { type: "view" as const, viewId: UNCATEGORIZED_VIEW_ID },
    scopeData: {
      valid: true,
      targetView: null,
      categoryIds: [],
      directFeedIds: [],
      sections: [],
    },
  };
}

async function queryCustomViewFeedAvailability(input: {
  database: NavigationDatabase;
  userId: string;
  now: Date;
}) {
  const directMembership = exists(
    input.database
      .select({ value: sql<number>`1` })
      .from(viewFeeds)
      .where(
        and(eq(viewFeeds.viewId, views.id), eq(viewFeeds.feedId, feeds.id)),
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
          eq(feedCategories.feedId, feeds.id),
        ),
      ),
  );
  const hasConfiguredMembership = or(
    exists(
      input.database
        .select({ value: sql<number>`1` })
        .from(viewFeeds)
        .where(eq(viewFeeds.viewId, views.id)),
    ),
    exists(
      input.database
        .select({ value: sql<number>`1` })
        .from(viewCategories)
        .where(eq(viewCategories.viewId, views.id)),
    ),
  );
  const belongsToView = or(
    directMembership,
    and(
      feedCompatibleWithView(),
      or(tagMembership, not(hasConfiguredMembership ?? sql`0`)),
    ),
  );
  const contentStatusExists = (contentStatus: ContentStatusFilter) =>
    feedExistsForViewFeed({ ...input, contentStatus });

  return input.database
    .select({
      id: feeds.id,
      viewId: views.id,
      feedId: feeds.id,
      ...availabilitySelection(contentStatusExists),
    })
    .from(views)
    .innerJoin(feeds, and(eq(feeds.userId, input.userId), belongsToView))
    .where(eq(views.userId, input.userId));
}

async function queryUncategorizedViewFeedAvailability(input: {
  database: NavigationDatabase;
  userId: string;
}) {
  const uncategorizedScope = buildUncategorizedScope(
    input.database,
    input.userId,
  );
  const contentStatusExists = (contentStatus: ContentStatusFilter) =>
    exists(
      input.database
        .select({ value: sql<number>`1` })
        .from(feedItems)
        .where(
          and(
            eq(feedItems.feedId, feeds.id),
            contentStatusCondition({
              contentStatus,
              isRead: feedItems.isWatched,
              isLater: feedItems.isWatchLater,
            }),
          ),
        ),
    );

  return input.database
    .select({
      id: feeds.id,
      viewId: sql<number>`${UNCATEGORIZED_VIEW_ID}`,
      feedId: feeds.id,
      ...availabilitySelection(contentStatusExists),
    })
    .from(feeds)
    .where(
      and(
        eq(feeds.userId, input.userId),
        feedScopeCondition(uncategorizedScope),
      ),
    );
}

function viewFeedAvailabilityRecord(
  viewIds: number[],
  rows: ViewFeedAvailabilityRow[],
) {
  const result: Record<
    number,
    Record<number, NavigationAvailability>
  > = Object.fromEntries(viewIds.map((viewId) => [viewId, {}]));

  for (const row of rows) {
    result[row.viewId] ??= {};
    result[row.viewId]![row.feedId] = {
      inbox: {
        unread: Boolean(row.inboxUnread),
        archived: Boolean(row.inboxArchived),
      },
      saved: {
        unread: Boolean(row.savedUnread),
        archived: Boolean(row.savedArchived),
      },
    };
  }
  return result;
}

export async function queryNavigationSnapshot(input: {
  database: NavigationDatabase;
  userId: string;
  now?: Date;
}): Promise<NavigationSnapshot> {
  const now = input.now ?? new Date();
  const [
    viewAvailability,
    tagAvailability,
    feedAvailability,
    customViewFeedAvailability,
    uncategorizedViewFeedAvailability,
  ] = await Promise.all([
    queryViewAvailability({ ...input, now }),
    queryTagAvailability(input),
    queryFeedAvailability(input),
    queryCustomViewFeedAvailability({ ...input, now }),
    queryUncategorizedViewFeedAvailability(input),
  ]);
  return {
    views: viewAvailability,
    tags: tagAvailability,
    feeds: feedAvailability,
    viewFeeds: viewFeedAvailabilityRecord(
      Object.keys(viewAvailability).map(Number),
      [...customViewFeedAvailability, ...uncategorizedViewFeedAvailability],
    ),
  };
}
