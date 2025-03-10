import { inferRouterOutputs } from "@trpc/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  contentCategories,
  feedCategories,
  feedItems,
  feeds,
} from "~/server/db/schema";
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

              const newFeeds = await tx
                .insert(feeds)
                .values({
                  userId: ctx.auth!.userId!,
                  ...newFeed,
                })
                .returning();

              const newFeedRow = newFeeds?.[0];

              console.log(input.categoryId);
              console.log(newFeeds);

              if (input.categoryId && !!newFeedRow) {
                await tx.insert(feedCategories).values({
                  feedId: Number(newFeedRow.id),
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
    const feedsList = await ctx.db.query.feeds.findMany({
      where: sql`user_id = ${ctx.auth!.userId}`,
    });

    if (!feedsList) {
      return {
        feeds: [],
        items: [],
      };
    }

    const feedData = await fetchFeedData(feedsList);

    if (!feedData) {
      return {
        feeds: feedsList,
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

    const feedIds = feedsList.map((feed) => feed.id);
    if (!feedIds.length) {
      return {
        feeds: [],
        items: [],
      };
    }

    const itemsQueryData = await ctx.db
      .select()
      .from(feedItems)
      .where(inArray(feedItems.feedId, feedIds))
      .leftJoin(feedCategories, eq(feedItems.feedId, feedCategories.feedId))
      .leftJoin(
        contentCategories,
        eq(contentCategories.id, feedCategories.categoryId),
      )
      .orderBy(desc(feedItems.postedAt));

    return {
      feeds: feedsList,
      items: itemsQueryData,
    };
  }),
  getAll: protectedProcedure.query(async ({ ctx }) => {
    const feedsList = await ctx.db.query.feeds.findMany({
      where: sql`user_id = ${ctx.auth!.userId}`,
    });

    return feedsList;

    // const feedIds = feedsList.map((feed) => feed.id);

    // const feedCategoriesList = await ctx.db
    //   .select()
    //   .from(feedCategories)
    //   .where(inArray(feedCategories.feedId, feedIds));

    // return feedsList.map((feed) => ({
    //   ...feed,
    //   categories: feedCategoriesList.filter(
    //     (feedCategory) => feedCategory.feedId === feed.id,
    //   ),
    // }));
  }),
});

export type FeedRouter = inferRouterOutputs<typeof feedRouter>;
