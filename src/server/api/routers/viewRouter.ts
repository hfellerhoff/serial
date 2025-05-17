import { and, asc, eq, notInArray } from "drizzle-orm";
import { z } from "zod";
import { sortViewsByPlacement } from "~/lib/data/views/utils";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  type ApplicationView,
  createViewSchema,
  deleteViewSchema,
  updateViewSchema,
  viewCategories,
  views,
} from "~/server/db/schema";

export const viewRouter = createTRPCRouter({
  create: protectedProcedure
    .input(createViewSchema)
    .mutation(async ({ ctx, input }) => {
      await ctx.db.transaction(async (tx) => {
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
  update: protectedProcedure
    .input(updateViewSchema)
    .mutation(async ({ ctx, input }) => {
      await ctx.db.transaction(async (tx) => {
        const viewsResult = await tx
          .update(views)
          .set({
            name: input.name,
            daysWindow: input.daysWindow,
            readStatus: input.readStatus,
            orientation: input.orientation,
            placement: input.placement,
          })
          .where(
            and(eq(views.userId, ctx.auth!.user.id), eq(views.id, input.id)),
          )
          .returning();

        const view = viewsResult?.[0];

        if (!input.categoryIds || !view) return;

        await tx
          .delete(viewCategories)
          .where(
            and(
              eq(viewCategories.viewId, view.id),
              notInArray(viewCategories.categoryId, input.categoryIds),
            ),
          );

        return await Promise.all(
          input.categoryIds.map(async (categoryId) => {
            await tx
              .insert(viewCategories)
              .values({
                viewId: view.id,
                categoryId,
              })
              .onConflictDoNothing();
          }),
        );
      });
    }),
  updatePlacement: protectedProcedure
    .input(
      z.object({
        views: z.array(
          z.object({
            id: z.number(),
            placement: z.number(),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.transaction(async (tx) => {
        return await Promise.all(
          input.views.map(async (view) => {
            return await tx
              .update(views)
              .set({
                placement: view.placement,
              })
              .where(
                and(eq(views.id, view.id), eq(views.userId, ctx.auth!.user.id)),
              );
          }),
        );
      });
    }),
  delete: protectedProcedure
    .input(deleteViewSchema)
    .mutation(async ({ ctx, input }) => {
      await ctx.db.transaction(async (tx) => {
        await tx
          .delete(viewCategories)
          .where(eq(viewCategories.viewId, input.id));

        return await tx
          .delete(views)
          .where(
            and(eq(views.id, input.id), eq(views.userId, ctx.auth!.user.id)),
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

    return sortViewsByPlacement(zippedViews);
  }),
});
