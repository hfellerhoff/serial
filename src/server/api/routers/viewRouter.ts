import { eq, asc } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  ApplicationView,
  createViewSchema,
  viewCategories,
  views,
} from "~/server/db/schema";

export const viewRouter = createTRPCRouter({
  create: protectedProcedure
    .input(createViewSchema)
    .mutation(async ({ ctx, input }) => {
      ctx.db.transaction(async (tx) => {
        const viewsResult = await tx
          .insert(views)
          .values({
            userId: ctx.auth!.user.id,
            name: input.name,
            daysWindow: input.daysWindow,
            readStatus: input.readStatus,
            orientation: input.orientation,
            placement: input.placement,
          })
          .returning();

        const view = viewsResult?.[0];

        if (!input.categoryIds || !view) return;

        return await Promise.all(
          input.categoryIds.map(async (categoryId) => {
            await tx.insert(viewCategories).values({
              viewId: view.id,
              categoryId,
            });
          }),
        );
      });
    }),
  getAll: protectedProcedure.query(async ({ ctx }) => {
    const viewsList = await ctx.db
      .select()
      .from(views)
      .where(eq(views.userId, ctx.auth!.user.id))
      .orderBy(asc(views.placement));

    const viewCategoriesList = await ctx.db.select().from(viewCategories);

    const zippedViews = viewsList.map((view) => {
      const applicationView: ApplicationView = {
        ...view,
        isDefault: false,
        categoryIds: viewCategoriesList
          .filter((category) => category.viewId === view.id)
          .map((category) => category.categoryId)
          .filter((id) => id !== null),
      };

      return applicationView;
    });

    return zippedViews;
  }),
});
