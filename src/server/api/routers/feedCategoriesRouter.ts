import { eq, asc, inArray, and } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { contentCategories, feedCategories } from "~/server/db/schema";

export const feedCategoriesRouter = createTRPCRouter({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    const contentCategoriesList = await ctx.db
      .select()
      .from(contentCategories)
      .where(eq(contentCategories.userId, ctx.auth!.userId!))
      .orderBy(asc(contentCategories.name));
    const categoryIds = contentCategoriesList.map(
      (contentCategory) => contentCategory.id,
    );

    const feedCategoriesList = await ctx.db
      .select()
      .from(feedCategories)
      .where(inArray(feedCategories.categoryId, categoryIds))
      .orderBy(asc(feedCategories.categoryId));

    return feedCategoriesList;
  }),
  assignToFeed: protectedProcedure
    .input(z.object({ feedId: z.number(), categoryId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.insert(feedCategories).values({
        feedId: input.feedId,
        categoryId: input.categoryId,
      });
    }),
  removeFromFeed: protectedProcedure
    .input(z.object({ feedId: z.number(), categoryId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(feedCategories)
        .where(
          and(
            eq(feedCategories.feedId, input.feedId),
            eq(feedCategories.categoryId, input.categoryId),
          ),
        );
    }),
});
