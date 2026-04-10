import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import {
  verifyFeedsOwnedByUser,
  verifyViewsOwnedByUser,
} from "./feed-router/utils";
import { protectedProcedure } from "~/server/orpc/base";
import { viewFeeds, views } from "~/server/db/schema";

export const getAll = protectedProcedure.handler(async ({ context }) => {
  const userViews = await context.db
    .select({ id: views.id })
    .from(views)
    .where(eq(views.userId, context.user.id));
  const viewIds = userViews.map((v) => v.id);

  if (viewIds.length === 0) return [];

  return await context.db
    .select()
    .from(viewFeeds)
    .where(inArray(viewFeeds.viewId, viewIds));
});

export const assignToView = protectedProcedure
  .input(z.object({ viewId: z.number(), feedId: z.number() }))
  .handler(async ({ context, input }) => {
    await context.db.transaction(async (tx) => {
      const [feedOwned, viewOwned] = await Promise.all([
        verifyFeedsOwnedByUser({
          feedIds: [input.feedId],
          userId: context.user.id,
          db: tx,
        }),
        verifyViewsOwnedByUser({
          viewIds: [input.viewId],
          userId: context.user.id,
          db: tx,
        }),
      ]);

      if (!feedOwned) {
        throw new Error("Unauthorized: Feed does not belong to user");
      }
      if (!viewOwned) {
        throw new Error("Unauthorized: View does not belong to user");
      }

      await tx
        .insert(viewFeeds)
        .values({
          viewId: input.viewId,
          feedId: input.feedId,
        })
        .onConflictDoNothing();
    });
  });

export const removeFromView = protectedProcedure
  .input(z.object({ viewId: z.number(), feedId: z.number() }))
  .handler(async ({ context, input }) => {
    await context.db.transaction(async (tx) => {
      const [feedOwned, viewOwned] = await Promise.all([
        verifyFeedsOwnedByUser({
          feedIds: [input.feedId],
          userId: context.user.id,
          db: tx,
        }),
        verifyViewsOwnedByUser({
          viewIds: [input.viewId],
          userId: context.user.id,
          db: tx,
        }),
      ]);

      if (!feedOwned) {
        throw new Error("Unauthorized: Feed does not belong to user");
      }
      if (!viewOwned) {
        throw new Error("Unauthorized: View does not belong to user");
      }

      await tx
        .delete(viewFeeds)
        .where(
          and(
            eq(viewFeeds.viewId, input.viewId),
            eq(viewFeeds.feedId, input.feedId),
          ),
        );
    });
  });

export const bulkAssignToView = protectedProcedure
  .input(z.object({ feedIds: z.number().array(), viewId: z.number() }))
  .handler(async ({ context, input }) => {
    if (input.feedIds.length === 0) return;

    await context.db.transaction(async (tx) => {
      const [feedsOwned, viewOwned] = await Promise.all([
        verifyFeedsOwnedByUser({
          feedIds: input.feedIds,
          userId: context.user.id,
          db: tx,
        }),
        verifyViewsOwnedByUser({
          viewIds: [input.viewId],
          userId: context.user.id,
          db: tx,
        }),
      ]);

      if (!feedsOwned) {
        throw new Error(
          "Unauthorized: One or more feeds do not belong to user",
        );
      }
      if (!viewOwned) {
        throw new Error("Unauthorized: View does not belong to user");
      }

      await tx
        .insert(viewFeeds)
        .values(
          input.feedIds.map((feedId) => ({
            viewId: input.viewId,
            feedId,
          })),
        )
        .onConflictDoNothing();
    });
  });

export const bulkRemoveFromView = protectedProcedure
  .input(z.object({ feedIds: z.number().array(), viewId: z.number() }))
  .handler(async ({ context, input }) => {
    if (input.feedIds.length === 0) return;

    await context.db.transaction(async (tx) => {
      const [feedsOwned, viewOwned] = await Promise.all([
        verifyFeedsOwnedByUser({
          feedIds: input.feedIds,
          userId: context.user.id,
          db: tx,
        }),
        verifyViewsOwnedByUser({
          viewIds: [input.viewId],
          userId: context.user.id,
          db: tx,
        }),
      ]);

      if (!feedsOwned) {
        throw new Error(
          "Unauthorized: One or more feeds do not belong to user",
        );
      }
      if (!viewOwned) {
        throw new Error("Unauthorized: View does not belong to user");
      }

      await tx
        .delete(viewFeeds)
        .where(
          and(
            inArray(viewFeeds.feedId, input.feedIds),
            eq(viewFeeds.viewId, input.viewId),
          ),
        );
    });
  });
