import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { verifyFeedsOwnedByUser } from "./feed-router/utils";
import { protectedProcedure } from "~/server/orpc/base";
import {
  contentCategories,
  feedCategories,
  viewCategories,
} from "~/server/db/schema";

const categoryNameSchema = z.string().min(2);
const feedCategorizationSchema = z.object({
  feedId: z.number(),
  selected: z.boolean(),
});
export type FeedCategorization = Required<
  z.infer<typeof feedCategorizationSchema>
>;

const feedCategorizationsSchema = z.array(feedCategorizationSchema).optional();

export const create = protectedProcedure
  .input(
    z.object({
      name: categoryNameSchema,
      feedCategorizations: feedCategorizationsSchema,
    }),
  )
  .handler(async ({ context, input }) => {
    await context.db.transaction(async (tx) => {
      const feedIdsToCategorize =
        input.feedCategorizations
          ?.filter((categorization) => categorization.selected)
          .map((categorization) => categorization.feedId) ?? [];

      if (feedIdsToCategorize.length > 0) {
        const isOwned = await verifyFeedsOwnedByUser({
          feedIds: feedIdsToCategorize,
          userId: context.user.id,
          db: tx,
        });

        if (!isOwned) {
          throw new Error(
            "Unauthorized: One or more feeds do not belong to user",
          );
        }
      }

      const categories = await tx
        .insert(contentCategories)
        .values({
          userId: context.user.id,
          name: input.name,
        })
        .returning();
      const category = categories[0];

      if (!category || feedIdsToCategorize.length === 0) return;

      await Promise.all(
        feedIdsToCategorize.map(async (feedId) => {
          return await tx.insert(feedCategories).values({
            categoryId: category.id,
            feedId,
          });
        }),
      );
    });
  });

export const getAll = protectedProcedure.handler(async ({ context }) => {
  const contentCategoriesList = await context.db
    .select()
    .from(contentCategories)
    .where(eq(contentCategories.userId, context.user.id))
    .orderBy(asc(contentCategories.name));

  return contentCategoriesList;
});

export const update = protectedProcedure
  .input(
    z.object({
      id: z.number(),
      name: categoryNameSchema,
      feedCategorizations: feedCategorizationsSchema,
    }),
  )
  .handler(async ({ context, input }) => {
    await context.db.transaction(async (tx) => {
      const allFeedIds = input.feedCategorizations?.map((c) => c.feedId) ?? [];

      if (allFeedIds.length > 0) {
        const isOwned = await verifyFeedsOwnedByUser({
          feedIds: allFeedIds,
          userId: context.user.id,
          db: tx,
        });

        if (!isOwned) {
          throw new Error(
            "Unauthorized: One or more feeds do not belong to user",
          );
        }
      }

      const categories = await tx
        .update(contentCategories)
        .set({
          name: input.name,
        })
        .where(
          and(
            eq(contentCategories.userId, context.user.id),
            eq(contentCategories.id, input.id),
          ),
        )
        .returning();
      const category = categories[0];

      if (!input.feedCategorizations || !category) return;

      const feedIdsToCategorize = input.feedCategorizations
        .filter((categorization) => categorization.selected)
        .map((categorization) => categorization.feedId);

      const feedIdsToDecategorize = input.feedCategorizations
        .filter((categorization) => !categorization.selected)
        .map((categorization) => categorization.feedId);

      if (feedIdsToCategorize.length > 0) {
        await Promise.all(
          feedIdsToCategorize.map(async (feedId) => {
            return await tx
              .insert(feedCategories)
              .values({
                categoryId: category.id,
                feedId,
              })
              .onConflictDoNothing();
          }),
        );
      }

      if (feedIdsToDecategorize.length > 0) {
        await Promise.all(
          feedIdsToDecategorize.map(async (feedId) => {
            return await tx
              .delete(feedCategories)
              .where(
                and(
                  eq(feedCategories.feedId, feedId),
                  eq(feedCategories.categoryId, input.id),
                ),
              );
          }),
        );
      }
    });
  });

export const deleteCategory = protectedProcedure
  .input(z.object({ id: z.number() }))
  .handler(async ({ context, input }) => {
    await context.db.transaction(async (tx) => {
      await tx
        .delete(feedCategories)
        .where(eq(feedCategories.categoryId, input.id));

      await tx
        .delete(viewCategories)
        .where(eq(viewCategories.categoryId, input.id));

      await tx
        .delete(contentCategories)
        .where(
          and(
            eq(contentCategories.id, input.id),
            eq(contentCategories.userId, context.user.id),
          ),
        );
    });
  });
