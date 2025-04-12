import dayjs from "dayjs";
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { checkFeedItemIsVerticalFromThumbnail } from "~/server/checkFeedItemIsVertical";
import { feedItems, feeds } from "~/server/db/schema";
import { fetchFeedData } from "~/server/rss/fetchFeeds";

const isWithinLastMonth = gte(
  feedItems.postedAt,
  dayjs().subtract(32, "days").toDate(),
);

export const feedItemRouter = createTRPCRouter({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    const feedsData = await ctx.db.query.feeds.findMany({
      where: eq(feeds.userId, ctx.auth!.user.id),
    });
    const feedIds = feedsData.map((feed) => feed.id);

    const itemsData = await ctx.db.query.feedItems.findMany({
      where: and(inArray(feedItems.feedId, feedIds), isWithinLastMonth),
      orderBy: desc(feedItems.postedAt),
    });

    return itemsData;
  }),
  fetchNewItems: protectedProcedure.mutation(async ({ ctx }) => {
    const feedsList = await ctx.db.query.feeds.findMany({
      where: sql`user_id = ${ctx.auth!.user.id}`,
    });

    if (!feedsList) {
      return;
    }

    const feedData = await fetchFeedData(feedsList);
    if (!feedData) {
      return;
    }

    const feedItemList: (typeof feedItems.$inferInsert)[] =
      feedData?.flatMap((feed) => {
        return feed.items.map((item) => {
          return {
            feedId: feed.id,
            contentId: item.id,
            title: item.title ?? "",
            author: item.author ?? "",
            thumbnail: item.thumbnail ?? "",
            url: item.url ?? "",
            postedAt: new Date(item.publishedDate),
          } satisfies typeof feedItems.$inferInsert;
        });
      }) ?? [];

    await ctx.db.transaction(async (tx) => {
      return await Promise.all(
        feedItemList.map(async (item) => {
          return await tx
            .insert(feedItems)
            .values(item)
            .onConflictDoUpdate({
              target: [feedItems.contentId, feedItems.feedId],
              set: item,
            });
        }),
      );
    });

    // check if items are vertical
    const uncategorizedFeedItems = await ctx.db
      .select()
      .from(feedItems)
      .where(and(isNull(feedItems.orientation), isWithinLastMonth));

    if (uncategorizedFeedItems.length === 0) {
      return;
    }

    const categorizedFeedItems: (typeof feedItems.$inferInsert)[] = (
      await Promise.all(
        uncategorizedFeedItems.map(async (item) => {
          const orientation = await checkFeedItemIsVerticalFromThumbnail(
            item.thumbnail,
          );

          if (orientation !== null) {
            return {
              ...item,
              orientation,
            };
          }
        }),
      )
    ).filter(Boolean);

    await ctx.db.transaction(async (tx) => {
      return await Promise.all(
        categorizedFeedItems.map(async (item) => {
          return await tx
            .insert(feedItems)
            .values(item)
            .onConflictDoUpdate({
              target: [feedItems.contentId, feedItems.feedId],
              set: item,
            });
        }),
      );
    });
  }),
  setWatchedValue: protectedProcedure
    .input(
      z.object({
        feedId: z.number(),
        contentId: z.string(),
        isWatched: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(feedItems)
        .set({
          isWatched: input.isWatched,
        })
        .where(
          and(
            eq(feedItems.feedId, input.feedId),
            eq(feedItems.contentId, input.contentId),
          ),
        );
    }),
  setWatchLaterValue: protectedProcedure
    .input(
      z.object({
        feedId: z.number(),
        contentId: z.string(),
        isWatchLater: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(feedItems)
        .set({
          isWatchLater: input.isWatchLater,
        })
        .where(
          and(
            eq(feedItems.feedId, input.feedId),
            eq(feedItems.contentId, input.contentId),
          ),
        );
    }),
});
