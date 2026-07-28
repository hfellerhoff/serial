import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { verifyFeedsOwnedByUser } from "./feed-router/utils";
import { protectedProcedure } from "~/server/orpc/base";
import { contentCategories, feedCategories } from "~/server/db/schema";

export const getAll = protectedProcedure.handler(async ({ context }) => {
  const contentCategoriesList = await context.db
    .select()
    .from(contentCategories)
    .where(eq(contentCategories.userId, context.user.id))
    .orderBy(asc(contentCategories.name));
  const categoryIds = contentCategoriesList.map(
    (contentCategory) => contentCategory.id,
  );

  const feedCategoriesList = await context.db
    .select()
    .from(feedCategories)
    .where(inArray(feedCategories.categoryId, categoryIds))
    .orderBy(asc(feedCategories.categoryId));

  return feedCategoriesList;
});

export const assignToFeed = protectedProcedure
  .input(z.object({ feedId: z.number(), categoryId: z.number() }))
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

      await tx.insert(feedCategories).values({
        feedId: input.feedId,
        categoryId: input.categoryId,
      });
    });
  });

export const removeFromFeed = protectedProcedure
  .input(z.object({ feedId: z.number(), categoryId: z.number() }))
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
        .delete(feedCategories)
        .where(
          and(
            eq(feedCategories.feedId, input.feedId),
            eq(feedCategories.categoryId, input.categoryId),
          ),
        );
    });
  });

export const bulkAssignToFeeds = protectedProcedure
  .input(z.object({ feedIds: z.number().array(), categoryId: z.number() }))
  .handler(async ({ context, input }) => {
    if (input.feedIds.length === 0) return;

    await context.db.transaction(async (tx) => {
      const isOwned = await verifyFeedsOwnedByUser({
        feedIds: input.feedIds,
        userId: context.user.id,
        db: tx,
      });

      if (!isOwned) {
        throw new Error(
          "Unauthorized: One or more feeds do not belong to user",
        );
      }

      await Promise.all(
        input.feedIds.map(async (feedId) => {
          await tx
            .insert(feedCategories)
            .values({
              feedId,
              categoryId: input.categoryId,
            })
            .onConflictDoNothing();
        }),
      );
    });
  });

export const bulkRemoveFromFeeds = protectedProcedure
  .input(z.object({ feedIds: z.number().array(), categoryId: z.number() }))
  .handler(async ({ context, input }) => {
    if (input.feedIds.length === 0) return;

    await context.db.transaction(async (tx) => {
      const isOwned = await verifyFeedsOwnedByUser({
        feedIds: input.feedIds,
        userId: context.user.id,
        db: tx,
      });

      if (!isOwned) {
        throw new Error(
          "Unauthorized: One or more feeds do not belong to user",
        );
      }

      await tx
        .delete(feedCategories)
        .where(
          and(
            inArray(feedCategories.feedId, input.feedIds),
            eq(feedCategories.categoryId, input.categoryId),
          ),
        );
    });
  });
