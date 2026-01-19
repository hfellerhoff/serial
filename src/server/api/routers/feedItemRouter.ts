import dayjs from "dayjs";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { z } from "zod";
import { verifyFeedsOwnedByUser } from "./feed-router/utils";
import type { ApplicationFeedItem } from "~/server/db/schema";
import type { FetchFeedsStatus } from "~/server/rss/fetchFeeds";
import { prepareArrayChunks } from "~/lib/iterators";

import { feedItems, feeds } from "~/server/db/schema";
import { protectedProcedure } from "~/server/orpc/base";
import { fetchAndInsertFeedData } from "~/server/rss/fetchFeeds";

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

const GET_ALL_ITEMS_YIELD_BUFFER_MS = 100;
const GET_ALL_CHUNK_SIZE = 100;
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
    const itemFeed = feedsList.find((f) => f.id === item.feedId);

    return {
      ...item,
      platform: itemFeed?.platform ?? "youtube",
    } as ApplicationFeedItem;
  });

  // Send existing feed items to user
  let timeLastSent = 0;
  let inProgressChunk = [];
  for (const chunk of prepareArrayChunks(
    existingApplicationFeedItems,
    GET_ALL_CHUNK_SIZE,
  )) {
    inProgressChunk.push(...chunk);

    if (inProgressChunk.length < GET_ALL_CHUNK_SIZE) {
      continue;
    }

    const now = Date.now();
    const timePassed = now - timeLastSent;

    if (timePassed < GET_ALL_ITEMS_YIELD_BUFFER_MS) {
      await new Promise((res) =>
        setTimeout(res, GET_ALL_ITEMS_YIELD_BUFFER_MS - timePassed),
      );
    }

    timeLastSent = Date.now();

    yield {
      type: "feed-items",
      feedItems: inProgressChunk,
    } as GetAllItemsChunk;

    inProgressChunk = [];
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

    for (const chunk of prepareArrayChunks(
      feedResult.feedItems,
      GET_ALL_CHUNK_SIZE,
    )) {
      inProgressChunk.push(...chunk);
      if (inProgressChunk.length < GET_ALL_CHUNK_SIZE) {
        continue;
      }

      const now = Date.now();
      const timePassed = now - timeLastSent;

      if (timePassed < GET_ALL_ITEMS_YIELD_BUFFER_MS) {
        await new Promise((res) =>
          setTimeout(res, GET_ALL_ITEMS_YIELD_BUFFER_MS - timePassed),
        );
      }

      timeLastSent = Date.now();

      yield {
        type: "feed-items",
        feedItems: chunk,
      } as GetAllItemsChunk;

      inProgressChunk = [];
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
    await context.db.transaction(async (tx) => {
      const isOwned = await verifyFeedsOwnedByUser({
        feedIds: [input.feedId],
        userId: context.user.id,
        db: tx,
      });

      if (!isOwned) {
        throw new Error("Unauthorized: Feed does not belong to user");
      }

      await tx
        .update(feedItems)
        .set({
          isWatched: input.isWatched,
        })
        .where(
          and(eq(feedItems.feedId, input.feedId), eq(feedItems.id, input.id)),
        );
    });
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
    await context.db.transaction(async (tx) => {
      const isOwned = await verifyFeedsOwnedByUser({
        feedIds: [input.feedId],
        userId: context.user.id,
        db: tx,
      });

      if (!isOwned) {
        throw new Error("Unauthorized: Feed does not belong to user");
      }

      await tx
        .update(feedItems)
        .set({
          isWatchLater: input.isWatchLater,
        })
        .where(
          and(eq(feedItems.feedId, input.feedId), eq(feedItems.id, input.id)),
        );
    });
  });

export const getById = protectedProcedure
  .input(z.object({ id: z.string() }))
  .handler(async ({ context, input }) => {
    const item = await context.db.query.feedItems.findFirst({
      where: eq(feedItems.id, input.id),
    });

    if (!item) {
      return null;
    }

    const feed = await context.db.query.feeds.findFirst({
      where: and(eq(feeds.id, item.feedId), eq(feeds.userId, context.user.id)),
    });

    if (!feed) {
      return null;
    }

    return {
      ...item,
      platform: feed.platform,
    } as ApplicationFeedItem;
  });

export const getByFeedId = protectedProcedure
  .input(z.object({ feedId: z.number() }))
  .handler(async function* ({ context, input }) {
    const feed = await context.db.query.feeds.findFirst({
      where: and(eq(feeds.id, input.feedId), eq(feeds.userId, context.user.id)),
    });

    if (!feed) {
      return;
    }

    const itemsData = await context.db.query.feedItems.findMany({
      where: and(eq(feedItems.feedId, input.feedId), isWithinLastMonth),
      orderBy: desc(feedItems.postedAt),
    });

    const existingApplicationFeedItems = itemsData.map((item) => ({
      ...item,
      platform: feed.platform,
    })) as ApplicationFeedItem[];

    for (const chunk of prepareArrayChunks(existingApplicationFeedItems, 50)) {
      yield {
        type: "feed-items",
        feedItems: chunk,
      } as GetAllItemsChunk;
    }

    for await (const feedResult of fetchAndInsertFeedData(context, [feed])) {
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
