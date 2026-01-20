import { and, asc, eq, inArray, notInArray } from "drizzle-orm";
import { z } from "zod";
import type { ApplicationView } from "~/server/db/schema";
import { sortViewsByPlacement } from "~/lib/data/views/utils";
import { buildUncategorizedView } from "~/server/api/utils/buildUncategorizedView";

import { protectedProcedure } from "~/server/orpc/base";
import {
  contentCategories,
  createViewSchema,
  deleteViewSchema,
  updateViewSchema,
  viewCategories,
  views,
} from "~/server/db/schema";

export const create = protectedProcedure
  .input(createViewSchema)
  .handler(async ({ context, input }) => {
    return await context.db.transaction(async (tx) => {
      const viewsResult = await tx
        .insert(views)
        .values({
          userId: context.user.id,
          name: input.name,
          daysWindow: input.daysWindow,
          readStatus: input.readStatus,
          orientation: input.orientation,
          contentType: input.contentType,
          layout: input.layout,
          placement: input.placement,
        })
        .returning();

      const view = viewsResult[0];

      if (!view) return null;

      if (input.categoryIds) {
        await Promise.all(
          input.categoryIds.map(async (categoryId) => {
            await tx.insert(viewCategories).values({
              viewId: view.id,
              categoryId,
            });
          }),
        );
      }

      return view;
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
          contentType: input.contentType,
          layout: input.layout,
          placement: input.placement,
        })
        .where(and(eq(views.userId, context.user.id), eq(views.id, input.id)))
        .returning();

      const view = viewsResult[0];

      if (input.categoryIds.length === 0 || !view) return;

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
    return await context.db
      .delete(views)
      .where(and(eq(views.id, input.id), eq(views.userId, context.user.id)));
  });

export const getAll = protectedProcedure.handler(async ({ context }) => {
  const [viewsList, contentCategoriesList] = await Promise.all([
    context.db
      .select()
      .from(views)
      .where(eq(views.userId, context.user.id))
      .orderBy(asc(views.placement)),
    context.db
      .select()
      .from(contentCategories)
      .where(eq(contentCategories.userId, context.user.id)),
  ]);

  // Fetch view categories filtered by user's views
  const userViewIds = viewsList.map((v) => v.id);
  const viewCategoriesList =
    userViewIds.length > 0
      ? await context.db
          .select()
          .from(viewCategories)
          .where(inArray(viewCategories.viewId, userViewIds))
      : [];

  const customViews: ApplicationView[] = viewsList.map((view) => ({
    ...view,
    isDefault: false,
    categoryIds: viewCategoriesList
      .filter((category) => category.viewId === view.id)
      .map((category) => category.categoryId)
      .filter((id) => id !== null),
  }));

  const inboxView = buildUncategorizedView(
    context.user.id,
    contentCategoriesList,
    customViews,
  );

  return sortViewsByPlacement([...customViews, inboxView]);
});
