import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "~/env";
import { feedItems, feeds, instapaperConnections } from "~/server/db/schema";
import { addBookmark, getAccessToken } from "~/server/instapaper/client";
import { protectedProcedure } from "~/server/orpc/base";

export const getConnectionStatus = protectedProcedure.handler(
  async ({ context }) => {
    const connection = await context.db.query.instapaperConnections.findFirst({
      where: eq(instapaperConnections.userId, context.user.id),
    });

    const isConfigured = !!(
      env.INSTAPAPER_OAUTH_ID && env.INSTAPAPER_OAUTH_SECRET
    );

    return {
      isConnected: !!connection,
      username: connection?.username ?? null,
      isConfigured,
    };
  },
);

export const linkAccount = protectedProcedure
  .input(
    z.object({
      username: z.string().min(1),
      password: z.string().min(1),
    }),
  )
  .handler(async ({ context, input }) => {
    const tokens = await getAccessToken(input.username, input.password);

    const existingConnection =
      await context.db.query.instapaperConnections.findFirst({
        where: eq(instapaperConnections.userId, context.user.id),
      });

    if (existingConnection) {
      await context.db
        .update(instapaperConnections)
        .set({
          username: input.username,
          oauthToken: tokens.oauthToken,
          oauthTokenSecret: tokens.oauthTokenSecret,
          updatedAt: new Date(),
        })
        .where(eq(instapaperConnections.userId, context.user.id));
    } else {
      await context.db.insert(instapaperConnections).values({
        userId: context.user.id,
        username: input.username,
        oauthToken: tokens.oauthToken,
        oauthTokenSecret: tokens.oauthTokenSecret,
      });
    }

    return { success: true };
  });

export const unlinkAccount = protectedProcedure.handler(async ({ context }) => {
  await context.db
    .delete(instapaperConnections)
    .where(eq(instapaperConnections.userId, context.user.id));

  return { success: true };
});

export const saveBookmark = protectedProcedure
  .input(
    z.object({
      feedItemId: z.string(),
    }),
  )
  .handler(async ({ context, input }) => {
    const connection = await context.db.query.instapaperConnections.findFirst({
      where: eq(instapaperConnections.userId, context.user.id),
    });

    if (!connection) {
      throw new Error("Instapaper account not linked");
    }

    const feedItem = await context.db.query.feedItems.findFirst({
      where: eq(feedItems.id, input.feedItemId),
    });

    if (!feedItem) {
      throw new Error("Feed item not found");
    }

    // Verify the feed item belongs to a feed owned by the current user
    const feed = await context.db.query.feeds.findFirst({
      where: and(
        eq(feeds.id, feedItem.feedId),
        eq(feeds.userId, context.user.id),
      ),
    });

    if (!feed) {
      throw new Error("Feed item not found");
    }

    await addBookmark(
      {
        oauthToken: connection.oauthToken,
        oauthTokenSecret: connection.oauthTokenSecret,
      },
      {
        url: feedItem.url,
        title: feedItem.title,
        content: feedItem.content || undefined,
      },
    );

    await context.db
      .update(feedItems)
      .set({ isWatched: true })
      .where(eq(feedItems.id, input.feedItemId));

    return { success: true };
  });
