import { and, asc, eq, exists, gte, inArray, not, or, sql } from "drizzle-orm";
import type { MixedContentScope } from "../projection";
import type { db as defaultDatabase } from "~/server/db";
import type { DatabaseView, DatabaseViewSection } from "~/server/db/schema";
import { INBOX_VIEW_ID } from "~/lib/data/views/constants";
import {
  CONTENT_FILTER_OPTION,
  contentFilterColumnAllowsDescriptor,
  contentFilterColumnHasOption,
  contentFilterSqlPredicate,
} from "~/lib/views/contentFilter";
import {
  bookmarks,
  bookmarkTags,
  bookmarkViews,
  contentCategories,
  feedCategories,
  feedItems,
  feeds,
  viewCategories,
  viewFeeds,
  views,
  viewSections,
} from "~/server/db/schema";

const VIDEO_PLATFORMS = ["youtube", "peertube", "nebula"] as const;

type MixedContentDatabase = typeof defaultDatabase;

export type ScopeData = {
  valid: boolean;
  targetView: DatabaseView | null;
  categoryIds: number[];
  directFeedIds: number[];
  sections: DatabaseViewSection[];
};

export async function loadScopeData(input: {
  database: MixedContentDatabase;
  userId: string;
  scope: MixedContentScope;
}): Promise<ScopeData> {
  const { database, userId, scope } = input;
  if (scope.type === "tag") {
    const tag = await database
      .select({ id: contentCategories.id })
      .from(contentCategories)
      .where(
        and(
          eq(contentCategories.id, scope.tagId),
          eq(contentCategories.userId, userId),
        ),
      )
      .limit(1);
    return {
      valid: tag.length === 1,
      targetView: null,
      categoryIds: [],
      directFeedIds: [],
      sections: [],
    };
  }
  if (scope.viewId === INBOX_VIEW_ID) {
    return {
      valid: true,
      targetView: null,
      categoryIds: [],
      directFeedIds: [],
      sections: [],
    };
  }

  const [viewRows, categoryRows, directFeedRows, sectionRows] =
    await Promise.all([
      database
        .select()
        .from(views)
        .where(and(eq(views.id, scope.viewId), eq(views.userId, userId)))
        .limit(1),
      database
        .select({ categoryId: viewCategories.categoryId })
        .from(viewCategories)
        .where(eq(viewCategories.viewId, scope.viewId)),
      database
        .select({ feedId: viewFeeds.feedId })
        .from(viewFeeds)
        .where(eq(viewFeeds.viewId, scope.viewId)),
      database
        .select()
        .from(viewSections)
        .where(eq(viewSections.viewId, scope.viewId))
        .orderBy(asc(viewSections.placement)),
    ]);
  return {
    valid: viewRows.length === 1,
    targetView: viewRows[0] ?? null,
    categoryIds: categoryRows.flatMap(({ categoryId }) =>
      categoryId === null ? [] : [categoryId],
    ),
    directFeedIds: directFeedRows.map(({ feedId }) => feedId),
    sections: sectionRows,
  };
}

function compatibleFeedViewCondition() {
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

function feedInboxCondition(database: MixedContentDatabase, userId: string) {
  const compatibleView = compatibleFeedViewCondition();
  const direct = exists(
    database
      .select({ value: sql<number>`1` })
      .from(viewFeeds)
      .innerJoin(
        views,
        and(eq(views.id, viewFeeds.viewId), eq(views.userId, userId)),
      )
      .where(and(eq(viewFeeds.feedId, feeds.id), compatibleView)),
  );
  const tagged = exists(
    database
      .select({ value: sql<number>`1` })
      .from(feedCategories)
      .innerJoin(
        viewCategories,
        eq(viewCategories.categoryId, feedCategories.categoryId),
      )
      .innerJoin(
        views,
        and(eq(views.id, viewCategories.viewId), eq(views.userId, userId)),
      )
      .where(and(eq(feedCategories.feedId, feeds.id), compatibleView)),
  );
  return and(not(direct), not(tagged));
}

function bookmarkInboxCondition(
  database: MixedContentDatabase,
  userId: string,
) {
  const compatibleView = contentFilterColumnAllowsDescriptor({
    filter: views.contentFilter,
    contentType: bookmarks.contentType,
    orientation: bookmarks.orientation,
  });
  const direct = exists(
    database
      .select({ value: sql<number>`1` })
      .from(bookmarkViews)
      .innerJoin(
        views,
        and(eq(views.id, bookmarkViews.viewId), eq(views.userId, userId)),
      )
      .where(and(eq(bookmarkViews.bookmarkId, bookmarks.id), compatibleView)),
  );
  const tagged = exists(
    database
      .select({ value: sql<number>`1` })
      .from(bookmarkTags)
      .innerJoin(
        viewCategories,
        eq(viewCategories.categoryId, bookmarkTags.tagId),
      )
      .innerJoin(
        views,
        and(eq(views.id, viewCategories.viewId), eq(views.userId, userId)),
      )
      .where(and(eq(bookmarkTags.bookmarkId, bookmarks.id), compatibleView)),
  );
  return and(not(direct), not(tagged));
}

export function feedScopeCondition(input: {
  database: MixedContentDatabase;
  userId: string;
  scope: MixedContentScope;
  scopeData: ScopeData;
}) {
  const { database, userId, scope, scopeData } = input;
  if (scope.type === "tag") {
    return exists(
      database
        .select({ value: sql<number>`1` })
        .from(feedCategories)
        .where(
          and(
            eq(feedCategories.feedId, feeds.id),
            eq(feedCategories.categoryId, scope.tagId),
          ),
        ),
    );
  }
  if (scope.viewId === INBOX_VIEW_ID) {
    return feedInboxCondition(database, userId);
  }
  const targetView = scopeData.targetView!;
  const membership =
    scopeData.directFeedIds.length === 0 && scopeData.categoryIds.length === 0
      ? sql`0`
      : or(
          scopeData.directFeedIds.length > 0
            ? inArray(feeds.id, scopeData.directFeedIds)
            : undefined,
          scopeData.categoryIds.length > 0
            ? exists(
                database
                  .select({ value: sql<number>`1` })
                  .from(feedCategories)
                  .where(
                    and(
                      eq(feedCategories.feedId, feeds.id),
                      inArray(feedCategories.categoryId, scopeData.categoryIds),
                    ),
                  ),
              )
            : undefined,
        );
  const contentFilter = contentFilterSqlPredicate({
    filter: targetView.contentFilter,
    contentType: feedItems.contentType,
    orientation: feedItems.orientation,
  });
  const timeWindow =
    targetView.daysWindow > 0
      ? gte(
          feedItems.postedAt,
          new Date(Date.now() - targetView.daysWindow * 86_400_000),
        )
      : undefined;
  return and(membership, contentFilter, timeWindow);
}

export function bookmarkScopeCondition(input: {
  database: MixedContentDatabase;
  userId: string;
  scope: MixedContentScope;
  scopeData: ScopeData;
}) {
  const { database, userId, scope, scopeData } = input;
  if (scope.type === "tag") {
    return exists(
      database
        .select({ value: sql<number>`1` })
        .from(bookmarkTags)
        .where(
          and(
            eq(bookmarkTags.bookmarkId, bookmarks.id),
            eq(bookmarkTags.tagId, scope.tagId),
          ),
        ),
    );
  }
  if (scope.viewId === INBOX_VIEW_ID) {
    return bookmarkInboxCondition(database, userId);
  }
  const targetView = scopeData.targetView!;
  const contentFilter = contentFilterSqlPredicate({
    filter: targetView.contentFilter,
    contentType: bookmarks.contentType,
    orientation: bookmarks.orientation,
  });
  const membership = or(
    exists(
      database
        .select({ value: sql<number>`1` })
        .from(bookmarkViews)
        .where(
          and(
            eq(bookmarkViews.bookmarkId, bookmarks.id),
            eq(bookmarkViews.viewId, scope.viewId),
          ),
        ),
    ),
    scopeData.categoryIds.length > 0
      ? exists(
          database
            .select({ value: sql<number>`1` })
            .from(bookmarkTags)
            .where(
              and(
                eq(bookmarkTags.bookmarkId, bookmarks.id),
                inArray(bookmarkTags.tagId, scopeData.categoryIds),
              ),
            ),
        )
      : undefined,
  );
  const timeWindow =
    targetView.daysWindow > 0
      ? gte(
          bookmarks.createdAt,
          new Date(Date.now() - targetView.daysWindow * 86_400_000),
        )
      : undefined;
  return and(membership, contentFilter, timeWindow);
}
