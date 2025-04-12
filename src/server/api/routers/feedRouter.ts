import type { inferRouterOutputs } from "@trpc/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  contentCategories,
  type DatabaseFeed,
  feedCategories,
  feedItems,
  feeds,
} from "~/server/db/schema";
import { fetchFeedData, fetchNewFeedDetails } from "~/server/rss/fetchFeeds";

const importUrlSchema = z
  .string()
  .startsWith("https://www.youtube.com/feeds/videos.xml?channel_id=");

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
                  eq(feeds.userId, ctx.auth!.user.id),
                ),
              });

              if (existingFeed) {
                return "Feed already exists";
              }

              const newFeeds = await tx
                .insert(feeds)
                .values({
                  userId: ctx.auth!.user.id,
                  ...newFeed,
                })
                .returning();

              const newFeedRow = newFeeds?.[0];

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
  createFeedsFromSubscriptionImport: protectedProcedure
    .input(
      z.object({
        channels: z
          .object({
            channelId: z.string(),
            feedUrl: z.string(),
            title: z.string(),
            shouldImport: z.boolean(),
          })
          .array(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!input.channels.length) return;

      const feedsToAdd: Omit<DatabaseFeed, "id" | "createdAt" | "updatedAt">[] =
        input.channels
          .filter((channel) => channel.shouldImport)
          .filter(
            (channel) => importUrlSchema.safeParse(channel.feedUrl).success,
          )
          .map((channel) => ({
            userId: ctx.auth!.user.id,
            name: channel.title,
            platform: "youtube",
            url: channel.feedUrl,
          }));
      if (!feedsToAdd.length) return;

      await ctx.db.transaction(async (tx) => {
        return await Promise.all(
          feedsToAdd.map(async (newFeed) => {
            if (!newFeed.url) return "No feed url found.";

            const existingFeed = await tx.query.feeds.findFirst({
              where: and(
                eq(feeds.url, newFeed.url),
                eq(feeds.userId, ctx.auth!.user.id),
              ),
            });

            if (existingFeed) {
              return "Feed already exists";
            }

            await tx.insert(feeds).values(newFeed);
          }),
        );
      });
    }),
  delete: protectedProcedure
    .input(z.number())
    .mutation(async ({ ctx, input }) => {
      await ctx.db.transaction(async (tx) => {
        await tx.delete(feedItems).where(eq(feedItems.feedId, input));

        await tx.delete(feedCategories).where(eq(feedCategories.feedId, input));

        await tx
          .delete(feeds)
          .where(and(eq(feeds.id, input), eq(feeds.userId, ctx.auth!.user.id)));
      });
    }),
  getAllFeedData: protectedProcedure.query(async ({ ctx }) => {
    const feedsList = await ctx.db.query.feeds.findMany({
      where: sql`user_id = ${ctx.auth!.user.id}`,
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
      where: sql`user_id = ${ctx.auth!.user.id}`,
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
