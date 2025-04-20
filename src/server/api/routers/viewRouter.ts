import { eq, asc } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { createViewSchema, views } from "~/server/db/schema";

export const viewRouter = createTRPCRouter({
  create: protectedProcedure
    .input(createViewSchema)
    .mutation(async ({ ctx, input }) => {
      await ctx.db.insert(views).values({
        userId: ctx.auth!.user.id,
        name: input.name,
        daysWindow: input.daysWindow,
        readStatus: input.readStatus,
        orientation: input.orientation,
        placement: input.placement,
      });
    }),
  getAll: protectedProcedure.query(async ({ ctx }) => {
    const viewsList = await ctx.db
      .select()
      .from(views)
      .where(eq(views.userId, ctx.auth!.user.id))
      .orderBy(asc(views.placement));

    return viewsList;
  }),
});
