import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { feedCategories, feedItems, feeds } from "~/server/db/schema";
import { fetchFeedData, fetchNewFeedDetails } from "~/server/rss/fetchFeeds";

export const feedRouter = createTRPCRouter({
  create: protectedProcedure
    .input(
      z.object({ url: z.string().min(5), categoryId: z.number().optional() }),
    )
    .mutation(async ({ ctx, input }) => {
      const newFeeds = await fetchNewFeedDetails(input.url);
      if (!newFeeds.length) {
        throw new Error("Unsupported feed URL");
      }

      const errors = (
        await ctx.db.transaction(async (tx) => {
          return await Promise.all(
            newFeeds.map(async (newFeed) => {
              if (!newFeed.url) return "No feed url found.";

              const existingFeed = await tx.query.feeds.findFirst({
                where: and(
                  eq(feeds.url, newFeed.url),
                  eq(feeds.userId, ctx.auth!.userId!),
                ),
              });

              if (existingFeed) {
                return "Feed already exists";
              }

              const feedRes = await tx.insert(feeds).values({
                userId: ctx.auth!.userId!,
                ...newFeed,
              });

              if (input.categoryId && feedRes.lastInsertRowid) {
                await tx.insert(feedCategories).values({
                  feedId: Number(feedRes.lastInsertRowid),
                  categoryId: input.categoryId,
                });
              }

              return null;
            }),
          );
        })
      ).filter(Boolean);

      if (errors.length === newFeeds.length) {
        throw new Error(errors[0]);
      }
    }),
  delete: protectedProcedure
    .input(z.number())
    .mutation(async ({ ctx, input }) => {
      await ctx.db.transaction(async (tx) => {
        await tx.delete(feedItems).where(eq(feedItems.feedId, input));

        await tx.delete(feedCategories).where(eq(feedCategories.feedId, input));

        await tx
          .delete(feeds)
          .where(and(eq(feeds.id, input), eq(feeds.userId, ctx.auth!.userId!)));
      });
    }),
  getAllFeedData: protectedProcedure.query(async ({ ctx }) => {
    const feeds = await ctx.db.query.feeds.findMany({
      where: sql`user_id = ${ctx.auth!.userId}`,
    });
    if (!feeds) {
      return {
        feeds: [],
        items: [],
      };
    }

    const feedData = await fetchFeedData(feeds);
    if (!feedData) {
      return {
        feeds: feeds,
        items: [],
      };
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

    const feedIds = feeds.map((feed) => feed.id);
    if (!feedIds.length) {
      return {
        feeds: [],
        items: [],
      }
    }

    const items = await ctx.db.query.feedItems.findMany({
      where: inArray(feedItems.feedId, feedIds),
      orderBy: desc(feedItems.postedAt),
    });

    return {
      feeds,
      items,
    };
  }),
  setFeedItemWatched: protectedProcedure
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
  setFeedItemWatchLater: protectedProcedure
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
