import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
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

export const contentCategoriesRouter = createTRPCRouter({
  create: protectedProcedure
    .input(
      z.object({
        name: categoryNameSchema,
        feedCategorizations: feedCategorizationsSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.transaction(async (tx) => {
        const categories = await tx
          .insert(contentCategories)
          .values({
            userId: ctx.auth!.user.id,
            name: input.name,
          })
          .returning();
        const category = categories[0];

        if (!input.feedCategorizations || !category) return;

        const feedIdsToCategorize = input.feedCategorizations
          .filter((categorization) => categorization.selected)
          .map((categorization) => categorization.feedId);

        if (!!feedIdsToCategorize.length) {
          await Promise.all(
            feedIdsToCategorize.map(async (feedId) => {
              return await tx.insert(feedCategories).values({
                categoryId: category.id,
                feedId,
              });
            }),
          );
        }
      });
    }),
  getAll: protectedProcedure.query(async ({ ctx }) => {
    const contentCategoriesList = await ctx.db
      .select()
      .from(contentCategories)
      .where(eq(contentCategories.userId, ctx.auth!.user.id))
      .orderBy(asc(contentCategories.name));

    return contentCategoriesList;
  }),
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: categoryNameSchema,
        feedCategorizations: feedCategorizationsSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.transaction(async (tx) => {
        const categories = await tx
          .update(contentCategories)
          .set({
            name: input.name,
          })
          .where(
            and(
              eq(contentCategories.userId, ctx.auth!.user.id),
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

        if (!!feedIdsToCategorize.length) {
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

        if (!!feedIdsToDecategorize.length) {
          await Promise.all(
            feedIdsToDecategorize.map(async (feedId) => {
              return await ctx.db
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
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.transaction(async (tx) => {
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
              eq(contentCategories.userId, ctx.auth!.user.id),
            ),
          );
      });
    }),
});
