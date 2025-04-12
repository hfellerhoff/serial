import { eq, asc } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { contentCategories } from "~/server/db/schema";

export const contentCategoriesRouter = createTRPCRouter({
  create: protectedProcedure
    .input(z.object({ name: z.string().min(2) }))
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
});
