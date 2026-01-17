import { and, asc, eq, notInArray } from "drizzle-orm";
import { z } from "zod";
import { sortViewsByPlacement } from "~/lib/data/views/utils";

import { protectedProcedure } from "~/server/orpc/base";
import {
  type ApplicationView,
  createViewSchema,
  deleteViewSchema,
  updateViewSchema,
  viewCategories,
  views,
} from "~/server/db/schema";

export const create = protectedProcedure
  .input(createViewSchema)
  .handler(async ({ context, input }) => {
    await context.db.transaction(async (tx) => {
      const viewsResult = await tx
        .insert(views)
        .values({
          userId: context.user.id,
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
  });

export const update = protectedProcedure
  .input(updateViewSchema)
  .handler(async ({ context, input }) => {
    await context.db.transaction(async (tx) => {
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
          and(eq(views.userId, context.user.id), eq(views.id, input.id)),
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
  });

export const updatePlacement = protectedProcedure
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
  .handler(async ({ context, input }) => {
    await context.db.transaction(async (tx) => {
      return await Promise.all(
        input.views.map(async (view) => {
          return await tx
            .update(views)
            .set({
              placement: view.placement,
            })
            .where(
              and(eq(views.id, view.id), eq(views.userId, context.user.id)),
            );
        }),
      );
    });
  });

export const deleteView = protectedProcedure
  .input(deleteViewSchema)
  .handler(async ({ context, input }) => {
    await context.db.transaction(async (tx) => {
      await tx
        .delete(viewCategories)
        .where(eq(viewCategories.viewId, input.id));

      return await tx
        .delete(views)
        .where(
          and(eq(views.id, input.id), eq(views.userId, context.user.id)),
        );
    });
  });

export const getAll = protectedProcedure.handler(async ({ context }) => {
  const viewsList = await context.db
    .select()
    .from(views)
    .where(eq(views.userId, context.user.id))
    .orderBy(asc(views.placement));

  const viewCategoriesList = await context.db.select().from(viewCategories);

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
});
