import dayjs from "dayjs";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { z } from "zod";
import { prepareArrayChunks } from "~/lib/iterators";

import { type ApplicationFeedItem, feedItems, feeds } from "~/server/db/schema";
import { protectedProcedure } from "~/server/orpc/base";
import {
  fetchAndInsertFeedData,
  FetchFeedsStatus,
} from "~/server/rss/fetchFeeds";

type GetAllItemsChunk =
  | {
      type: "feed-items";
      feedItems: ApplicationFeedItem[];
    }
  | {
      type: "feed-status";
      feedId: number;
      status: FetchFeedsStatus;
    };

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

  // Send existing feed items to user
  for (const chunk of prepareArrayChunks(existingApplicationFeedItems, 50)) {
    yield {
      type: "feed-items",
      feedItems: chunk,
    } as GetAllItemsChunk;
  }

  // Send new feed items to user as they come in
  for await (const feedResult of fetchAndInsertFeedData(context, feedsList)) {
    yield {
      type: "feed-status",
      status: feedResult.status,
      feedId: feedResult.id,
    } as GetAllItemsChunk;

    if (feedResult.status !== "success") {
      continue;
    }

    for (const chunk of prepareArrayChunks(feedResult.feedItems, 50)) {
      yield {
        type: "feed-items",
        feedItems: chunk,
      } as GetAllItemsChunk;
    }
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
