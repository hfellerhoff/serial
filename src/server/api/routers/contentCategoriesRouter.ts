import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  contentCategories,
  feedCategories,
  viewCategories,
} from "~/server/db/schema";

const categoryNameSchema = z.string().min(2);

export const contentCategoriesRouter = createTRPCRouter({
  create: protectedProcedure
    .input(z.object({ name: categoryNameSchema }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.insert(contentCategories).values({
        userId: ctx.auth!.user.id,
        name: input.name,
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
    .input(z.object({ id: z.number(), name: categoryNameSchema }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(contentCategories)
        .set({
          name: input.name,
        })
        .where(
          and(
            eq(contentCategories.userId, ctx.auth!.user.id),
            eq(contentCategories.id, input.id),
          ),
        );
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
