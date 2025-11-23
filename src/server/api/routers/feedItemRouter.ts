import dayjs from "dayjs";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { z } from "zod";
import { prepareArrayChunks } from "~/lib/iterators";

import { checkFeedItemIsVerticalFromUrl } from "~/server/checkFeedItemIsVertical";
import { type ApplicationFeedItem, feedItems, feeds } from "~/server/db/schema";
import { protectedProcedure } from "~/server/orpc/base";
import { fetchFeedData } from "~/server/rss/fetchFeeds";

const isWithinLastMonth = gte(
  feedItems.postedAt,
  dayjs().subtract(32, "days").toDate(),
);

export const getAll = protectedProcedure.handler(async function* ({ context }) {
  // Get existing items, yield
  const feedsList = await context.db.query.feeds.findMany({
    where: eq(feeds.userId, context.user.id),
  });
  const feedIds = feedsList.map((feed) => feed.id);

  const itemsData = await context.db.query.feedItems.findMany({
    where: and(inArray(feedItems.feedId, feedIds), isWithinLastMonth),
    orderBy: desc(feedItems.postedAt),
  });

  const existingApplicationFeedItems = itemsData.map((item) => {
    const feed = feedsList.find((feed) => feed.id === item.feedId);

    return {
      ...item,
      platform: feed?.platform ?? "youtube",
    } as ApplicationFeedItem;
  });

  for (const chunk of prepareArrayChunks(existingApplicationFeedItems, 50)) {
    yield chunk;
  }

  // Get new items, yield

  // TODO: split this out such that we can return data from
  // each feed as it comes in
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
          content: item.content ?? "",
          title: item.title ?? "",
          author: item.author ?? "",
          thumbnail: item.thumbnail ?? "",
          url: item.url ?? "",
          postedAt: new Date(item.publishedDate),
          orientation: checkFeedItemIsVerticalFromUrl(item.url),
        } satisfies typeof feedItems.$inferInsert;
      });
    }) ?? [];

  const feedItemsList = (
    await context.db.transaction(async (tx) => {
      return await Promise.all(
        feedItemList.map(async (item) => {
          try {
            return await tx
              .insert(feedItems)
              .values(item)
              .onConflictDoUpdate({
                target: [feedItems.url, feedItems.feedId],
                set: item,
              })
              .returning();
          } catch {
            // For local testing
            // console.dir({ ...error }, { depth: null });
          }

          return null;
        }),
      );
    })
  )
    .filter(Boolean)
    .flat();

  const newApplicationFeedItems = feedItemsList.map((item) => {
    const feed = feedsList.find((feed) => feed.id === item.feedId);

    return {
      ...item,
      platform: feed?.platform ?? "youtube",
    } as ApplicationFeedItem;
  });

  for (const chunk of prepareArrayChunks(newApplicationFeedItems, 50)) {
    yield chunk;
  }

  return;
});

export const setWatchedValue = protectedProcedure
  .input(
    z.object({
      id: z.string(),
      feedId: z.number(),
      isWatched: z.boolean(),
    }),
  )
  .handler(async ({ context, input }) => {
    await context.db
      .update(feedItems)
      .set({
        isWatched: input.isWatched,
      })
      .where(
        and(eq(feedItems.feedId, input.feedId), eq(feedItems.id, input.id)),
      );
  });

export const setWatchLaterValue = protectedProcedure
  .input(
    z.object({
      id: z.string(),
      feedId: z.number(),
      isWatchLater: z.boolean(),
    }),
  )
  .handler(async ({ context, input }) => {
    await context.db
      .update(feedItems)
      .set({
        isWatchLater: input.isWatchLater,
      })
      .where(
        and(eq(feedItems.feedId, input.feedId), eq(feedItems.id, input.id)),
      );
  });
