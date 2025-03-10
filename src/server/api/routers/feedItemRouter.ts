import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { feedItems, feeds } from "~/server/db/schema";
import { fetchFeedData } from "~/server/rss/fetchFeeds";

export const feedItemRouter = createTRPCRouter({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    const feedsData = await ctx.db.query.feeds.findMany({
      where: eq(feeds.userId, ctx.auth!.userId!),
    });
    const feedIds = feedsData.map((feed) => feed.id);

    const itemsData = await ctx.db.query.feedItems.findMany({
      where: inArray(feedItems.feedId, feedIds),
      orderBy: desc(feedItems.postedAt),
    });

    return itemsData;
  }),
  fetchNewItems: protectedProcedure.mutation(async ({ ctx }) => {
    const feedsList = await ctx.db.query.feeds.findMany({
      where: sql`user_id = ${ctx.auth!.userId}`,
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
