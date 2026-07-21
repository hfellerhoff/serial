import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getClientChannel } from "../channels";
import { verifyFeedsOwnedByUser } from "./feed-router/utils";
import type { ApplicationFeedItem } from "~/server/db/schema";
import type { FetchFeedsStatus } from "~/server/rss/fetchFeeds";
import { prepareArrayChunks } from "~/lib/iterators";
import { publisher } from "~/server/api/publisher";

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

const GET_ALL_ITEMS_YIELD_BUFFER_MS = 100;
const GET_ALL_CHUNK_SIZE = 100;
export const getAll = protectedProcedure.handler(async function* ({
  context,
}): AsyncGenerator<GetAllItemsChunk> {
  // Get existing items, yield
  const feedsList = await context.db.query.feeds.findMany({
    where: eq(feeds.userId, context.user.id),
  });
  const feedIds = feedsList.map((feed) => feed.id);

  const itemsData = await context.db.query.feedItems.findMany({
    where: and(inArray(feedItems.feedId, feedIds)),
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
    };

    inProgressChunk = [];
  }

  // Send new feed items to user as they come in
  for await (const feedResult of fetchAndInsertFeedData(context, feedsList)) {
    yield {
      type: "feed-status",
      status: feedResult.status,
      feedId: feedResult.id,
    };

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
      };

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
      clientId: z.string().optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    const updatedAt = new Date();
    const result = await context.db.transaction(async (tx) => {
      const isOwned = await verifyFeedsOwnedByUser({
        feedIds: [input.feedId],
        userId: context.user.id,
        db: tx,
      });

      if (!isOwned) {
        throw new Error("Unauthorized: Feed does not belong to user");
      }

      const [updatedItem] = await tx
        .update(feedItems)
        .set({
          isWatched: input.isWatched,
          isWatchedUpdatedAt: input.isWatched ? updatedAt : null,
          updatedAt,
        })
        .where(
          and(eq(feedItems.feedId, input.feedId), eq(feedItems.id, input.id)),
        )
        .returning({
          id: feedItems.id,
          feedId: feedItems.feedId,
          contentId: feedItems.contentId,
          title: feedItems.title,
          author: feedItems.author,
          url: feedItems.url,
          thumbnail: feedItems.thumbnail,
          contentSnippet: feedItems.contentSnippet,
          isWatched: feedItems.isWatched,
          isWatchedUpdatedAt: feedItems.isWatchedUpdatedAt,
          isWatchLater: feedItems.isWatchLater,
          isWatchLaterUpdatedAt: feedItems.isWatchLaterUpdatedAt,
          progress: feedItems.progress,
          duration: feedItems.duration,
          orientation: feedItems.orientation,
          postedAt: feedItems.postedAt,
          createdAt: feedItems.createdAt,
          updatedAt: feedItems.updatedAt,
          contentHash: feedItems.contentHash,
        });

      if (!updatedItem) {
        throw new Error("Feed item not found");
      }

      return updatedItem;
    });

    if (input.clientId) {
      const [feedRow] = await context.db
        .select({ platform: feeds.platform })
        .from(feeds)
        .where(eq(feeds.id, input.feedId));

      void publisher.publish(
        getClientChannel(context.user.id, input.clientId),
        {
          source: "initial",
          chunk: {
            type: "feed-items",
            feedItems: [
              {
                ...result,
                content: "",
                platform: feedRow?.platform ?? "youtube",
              } as ApplicationFeedItem,
            ],
          },
        },
      );
    }

    return {
      id: result.id,
      isWatched: result.isWatched,
      isWatchedUpdatedAt: result.isWatchedUpdatedAt,
      updatedAt: result.updatedAt,
    };
  });

export const setBulkWatchedValue = protectedProcedure
  .input(
    z.object({
      items: z.array(
        z.object({
          id: z.string(),
          feedId: z.number(),
        }),
      ),
      isWatched: z.boolean(),
    }),
  )
  .handler(async ({ context, input }) => {
    if (input.items.length === 0) return;

    const updatedAt = new Date();
    return context.db.transaction(async (tx) => {
      // Extract unique feedIds and verify ownership
      const feedIds = [...new Set(input.items.map((item) => item.feedId))];

      const isOwned = await verifyFeedsOwnedByUser({
        feedIds,
        userId: context.user.id,
        db: tx,
      });

      if (!isOwned) {
        throw new Error(
          "Unauthorized: One or more feeds do not belong to user",
        );
      }

      // Bulk update using inArray
      const itemIds = input.items.map((item) => item.id);
      return tx
        .update(feedItems)
        .set({
          isWatched: input.isWatched,
          isWatchedUpdatedAt: input.isWatched ? updatedAt : null,
          updatedAt,
        })
        .where(inArray(feedItems.id, itemIds))
        .returning({
          id: feedItems.id,
          isWatched: feedItems.isWatched,
          isWatchedUpdatedAt: feedItems.isWatchedUpdatedAt,
          updatedAt: feedItems.updatedAt,
        });
    });
  });

export const setWatchLaterValue = protectedProcedure
  .input(
    z.object({
      id: z.string(),
      feedId: z.number(),
      isWatchLater: z.boolean(),
      clientId: z.string().optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    const updatedAt = new Date();
    const result = await context.db.transaction(async (tx) => {
      const isOwned = await verifyFeedsOwnedByUser({
        feedIds: [input.feedId],
        userId: context.user.id,
        db: tx,
      });

      if (!isOwned) {
        throw new Error("Unauthorized: Feed does not belong to user");
      }

      const [updatedItem] = await tx
        .update(feedItems)
        .set({
          isWatchLater: input.isWatchLater,
          isWatchLaterUpdatedAt: updatedAt,
          updatedAt,
        })
        .where(
          and(eq(feedItems.feedId, input.feedId), eq(feedItems.id, input.id)),
        )
        .returning({
          id: feedItems.id,
          feedId: feedItems.feedId,
          contentId: feedItems.contentId,
          title: feedItems.title,
          author: feedItems.author,
          url: feedItems.url,
          thumbnail: feedItems.thumbnail,
          contentSnippet: feedItems.contentSnippet,
          isWatched: feedItems.isWatched,
          isWatchedUpdatedAt: feedItems.isWatchedUpdatedAt,
          isWatchLater: feedItems.isWatchLater,
          isWatchLaterUpdatedAt: feedItems.isWatchLaterUpdatedAt,
          progress: feedItems.progress,
          duration: feedItems.duration,
          orientation: feedItems.orientation,
          postedAt: feedItems.postedAt,
          createdAt: feedItems.createdAt,
          updatedAt: feedItems.updatedAt,
          contentHash: feedItems.contentHash,
        });

      if (!updatedItem) {
        throw new Error("Feed item not found");
      }

      return updatedItem;
    });

    if (input.clientId) {
      const [feedRow] = await context.db
        .select({ platform: feeds.platform })
        .from(feeds)
        .where(eq(feeds.id, input.feedId));

      void publisher.publish(
        getClientChannel(context.user.id, input.clientId),
        {
          source: "initial",
          chunk: {
            type: "feed-items",
            feedItems: [
              {
                ...result,
                content: "",
                platform: feedRow?.platform ?? "youtube",
              } as ApplicationFeedItem,
            ],
          },
        },
      );
    }

    return {
      id: result.id,
      isWatchLater: result.isWatchLater,
      isWatchLaterUpdatedAt: result.isWatchLaterUpdatedAt,
      updatedAt: result.updatedAt,
    };
  });

export const setProgress = protectedProcedure
  .input(
    z.object({
      id: z.string(),
      feedId: z.number(),
      progress: z.number().int().min(0),
      duration: z.number().int().min(0),
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
          progress: input.progress,
          duration: input.duration,
          updatedAt: new Date(),
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
  .handler(async function* ({
    context,
    input,
  }): AsyncGenerator<GetAllItemsChunk> {
    const feed = await context.db.query.feeds.findFirst({
      where: and(eq(feeds.id, input.feedId), eq(feeds.userId, context.user.id)),
    });

    if (!feed) {
      return;
    }

    const itemsData = await context.db.query.feedItems.findMany({
      where: and(eq(feedItems.feedId, input.feedId)),
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
      };
    }

    for await (const feedResult of fetchAndInsertFeedData(context, [feed])) {
      yield {
        type: "feed-status",
        status: feedResult.status,
        feedId: feedResult.id,
      };

      if (feedResult.status !== "success") {
        continue;
      }

      for (const chunk of prepareArrayChunks(feedResult.feedItems, 50)) {
        yield {
          type: "feed-items",
          feedItems: chunk,
        };
      }
    }

    return;
  });
