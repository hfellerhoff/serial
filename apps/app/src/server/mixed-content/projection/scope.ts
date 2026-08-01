import {
  and,
  asc,
  eq,
  exists,
  gte,
  inArray,
  isNull,
  ne,
  not,
  or,
  sql,
} from "drizzle-orm";
import type { MixedContentScope } from "../projection";
import type { db as defaultDatabase } from "~/server/db";
import type { DatabaseView, DatabaseViewSection } from "~/server/db/schema";
import { INBOX_VIEW_ID } from "~/lib/data/views/constants";
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
    inArray(views.contentType, ["all", "longform"]),
    and(
      inArray(views.contentType, ["horizontal-video", "vertical-video"]),
      inArray(feeds.platform, [...VIDEO_PLATFORMS]),
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
  const unfiltered = exists(
    database
      .select({ value: sql<number>`1` })
      .from(views)
      .where(
        and(
          eq(views.userId, userId),
          compatibleView,
          not(
            exists(
              database
                .select({ value: sql<number>`1` })
                .from(viewFeeds)
                .where(eq(viewFeeds.viewId, views.id)),
            ),
          ),
          not(
            exists(
              database
                .select({ value: sql<number>`1` })
                .from(viewCategories)
                .where(eq(viewCategories.viewId, views.id)),
            ),
          ),
        ),
      ),
  );
  return and(not(direct), not(tagged), not(unfiltered));
}

function bookmarkInboxCondition(
  database: MixedContentDatabase,
  userId: string,
) {
  const compatibleView = inArray(views.contentType, ["all", "longform"]);
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
  const unfiltered = exists(
    database
      .select({ value: sql<number>`1` })
      .from(views)
      .where(
        and(
          eq(views.userId, userId),
          compatibleView,
          not(
            exists(
              database
                .select({ value: sql<number>`1` })
                .from(viewFeeds)
                .where(eq(viewFeeds.viewId, views.id)),
            ),
          ),
          not(
            exists(
              database
                .select({ value: sql<number>`1` })
                .from(viewCategories)
                .where(eq(viewCategories.viewId, views.id)),
            ),
          ),
        ),
      ),
  );
  return and(not(direct), not(tagged), not(unfiltered));
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
    scopeData.categoryIds.length === 0 && scopeData.directFeedIds.length === 0
      ? undefined
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
  const contentType =
    targetView.contentType === "all"
      ? undefined
      : targetView.contentType === "longform"
        ? or(
            isNull(feedItems.orientation),
            ne(feedItems.orientation, "vertical"),
          )
        : and(
            inArray(feeds.platform, [...VIDEO_PLATFORMS]),
            eq(
              feedItems.orientation,
              targetView.contentType === "vertical-video"
                ? "vertical"
                : "horizontal",
            ),
          );
  const timeWindow =
    targetView.daysWindow > 0
      ? gte(
          feedItems.postedAt,
          new Date(Date.now() - targetView.daysWindow * 86_400_000),
        )
      : undefined;
  return and(membership, contentType, timeWindow);
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
  if (!["all", "longform"].includes(targetView.contentType)) return sql`0`;
  const membership =
    scopeData.categoryIds.length === 0 && scopeData.directFeedIds.length === 0
      ? undefined
      : or(
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
  return and(membership, timeWindow);
}
