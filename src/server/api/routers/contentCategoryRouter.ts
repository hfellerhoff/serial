import { sql } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { contentCategories } from "~/server/db/schema";

export const contentCategoriesRouter = createTRPCRouter({
  create: protectedProcedure
    .input(z.object({ name: z.string().min(2) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.insert(contentCategories).values({
        userId: ctx.auth!.userId!,
        name: input.name,
      });
    }),
  getAllForUser: protectedProcedure.query(async ({ ctx }) => {
    const contentCategories = await ctx.db.query.contentCategories.findMany({
      where: sql`user_id = ${ctx.auth!.userId!}`,
    });

    return contentCategories;
  }),
});
