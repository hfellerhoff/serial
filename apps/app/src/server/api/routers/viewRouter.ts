import { and, asc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { z } from "zod";

import {
  verifyContentCategoriesOwnedByUser,
  verifyFeedsOwnedByUser,
} from "./feed-router/utils";
import type { ApplicationView } from "~/server/db/schema";
import { loadApplicationViews } from "~/server/api/utils/loadApplicationViews";
import { protectedProcedure } from "~/server/orpc/base";
import { DEFAULT_VIEW_LAYOUT } from "~/server/db/constants";
import {
  createViewSchema,
  deleteViewSchema,
  updateViewSchema,
  viewCategories,
  viewFeeds,
  views,
  viewSections,
  viewSectionSchema,
} from "~/server/db/schema";
import {
  deduplicateByLastValue,
  MAX_BULK_MUTATION_ITEMS,
} from "~/lib/schemas/bulk";
import {
  organizationInvalidationSummary,
  publishReconciliationInvalidation,
} from "~/server/reconciliation/invalidation";

export const create = protectedProcedure
  .input(createViewSchema)
  .handler(async ({ context, input }) => {
    const result = await context.db.transaction(async (tx) => {
      const [categoriesOwned, feedsOwned] = await Promise.all([
        verifyContentCategoriesOwnedByUser({
          categoryIds: input.categoryIds ?? [],
          userId: context.user.id,
          db: tx,
        }),
        verifyFeedsOwnedByUser({
          feedIds: input.feedIds ?? [],
          userId: context.user.id,
          db: tx,
        }),
      ]);

      if (!categoriesOwned) {
        throw new Error(
          "Unauthorized: One or more categories do not belong to user",
        );
      }
      if (!feedsOwned) {
        throw new Error(
          "Unauthorized: One or more feeds do not belong to user",
        );
      }

      const viewsResult = await tx
        .insert(views)
        .values({
          userId: context.user.id,
          name: input.name,
          daysWindow: input.daysWindow,
          readStatus: input.readStatus,
          contentFilter: input.contentFilter,
          layout: input.layout ?? DEFAULT_VIEW_LAYOUT,
          placement: input.placement,
        })
        .returning();

      const view = viewsResult[0];

      if (!view) return null;

      if (input.categoryIds && input.categoryIds.length > 0) {
        await tx.insert(viewCategories).values(
          input.categoryIds.map((categoryId) => ({
            viewId: view.id,
            categoryId,
          })),
        );
      }

      if (input.feedIds && input.feedIds.length > 0) {
        await tx.insert(viewFeeds).values(
          input.feedIds.map((feedId) => ({
            viewId: view.id,
            feedId,
          })),
        );
      }

      if (input.viewSections && input.viewSections.length > 0) {
        await tx.insert(viewSections).values(
          input.viewSections.map((item, index) => ({
            viewId: view.id,
            placement: index,
            itemType: item.itemType,
            itemId: item.itemId,
            layout: item.layout ?? null,
          })),
        );
      }

      return view;
    });
    if (result) {
      await publishReconciliationInvalidation(
        context.user.id,
        organizationInvalidationSummary(),
      );
    }
    return result;
  });

export const update = protectedProcedure
  .input(updateViewSchema)
  .handler(async ({ context, input }) => {
    const result = await context.db.transaction(async (tx) => {
      const [categoriesOwned, feedsOwned] = await Promise.all([
        verifyContentCategoriesOwnedByUser({
          categoryIds: input.categoryIds,
          userId: context.user.id,
          db: tx,
        }),
        verifyFeedsOwnedByUser({
          feedIds: input.feedIds,
          userId: context.user.id,
          db: tx,
        }),
      ]);

      if (!categoriesOwned) {
        throw new Error(
          "Unauthorized: One or more categories do not belong to user",
        );
      }
      if (!feedsOwned) {
        throw new Error(
          "Unauthorized: One or more feeds do not belong to user",
        );
      }

      const viewsResult = await tx
        .update(views)
        .set({
          name: input.name,
          daysWindow: input.daysWindow,
          readStatus: input.readStatus,
          contentFilter: input.contentFilter,
          layout: input.layout,
          placement: input.placement,
        })
        .where(and(eq(views.userId, context.user.id), eq(views.id, input.id)))
        .returning();

      const view = viewsResult[0];

      if (!view) return;

      // Sync categories
      if (input.categoryIds.length === 0) {
        await tx
          .delete(viewCategories)
          .where(eq(viewCategories.viewId, view.id));
      } else {
        await tx
          .delete(viewCategories)
          .where(
            and(
              eq(viewCategories.viewId, view.id),
              notInArray(viewCategories.categoryId, input.categoryIds),
            ),
          );

        await tx
          .insert(viewCategories)
          .values(
            input.categoryIds.map((categoryId) => ({
              viewId: view.id,
              categoryId,
            })),
          )
          .onConflictDoNothing();
      }

      // Sync directly assigned feeds
      if (input.feedIds.length === 0) {
        await tx.delete(viewFeeds).where(eq(viewFeeds.viewId, view.id));
      } else {
        await tx
          .delete(viewFeeds)
          .where(
            and(
              eq(viewFeeds.viewId, view.id),
              notInArray(viewFeeds.feedId, input.feedIds),
            ),
          );

        await tx
          .insert(viewFeeds)
          .values(
            input.feedIds.map((feedId) => ({
              viewId: view.id,
              feedId,
            })),
          )
          .onConflictDoNothing();
      }

      // Sync view sections
      if (input.viewSections) {
        await tx.delete(viewSections).where(eq(viewSections.viewId, view.id));

        if (input.viewSections.length > 0) {
          await tx.insert(viewSections).values(
            input.viewSections.map((item, index) => ({
              viewId: view.id,
              placement: index,
              itemType: item.itemType,
              itemId: item.itemId,
              layout: item.layout ?? null,
            })),
          );
        }
      }

      const updatedSections = await tx
        .select()
        .from(viewSections)
        .where(eq(viewSections.viewId, view.id))
        .orderBy(asc(viewSections.placement));
      return {
        ...view,
        categoryIds: input.categoryIds,
        feedIds: input.feedIds,
        isDefault: false,
        viewSections: viewSectionSchema.array().parse(updatedSections),
      } satisfies ApplicationView;
    });
    if (result) {
      await publishReconciliationInvalidation(
        context.user.id,
        organizationInvalidationSummary(),
      );
    }
    return result;
  });

export const updatePlacement = protectedProcedure
  .input(
    z.object({
      views: z
        .array(
          z.object({
            id: z.number(),
            placement: z.number(),
          }),
        )
        .max(MAX_BULK_MUTATION_ITEMS)
        .transform((values) =>
          deduplicateByLastValue(values, (value) => value.id),
        ),
    }),
  )
  .handler(async ({ context, input }) => {
    if (input.views.length === 0) return;

    await context.db.transaction(async (tx) => {
      const placementCases = input.views.map(
        (view) => sql`when ${view.id} then ${view.placement}`,
      );
      await tx
        .update(views)
        .set({
          placement: sql`case ${views.id} ${sql.join(placementCases, sql.raw(" "))} else ${views.placement} end`,
        })
        .where(
          and(
            inArray(
              views.id,
              input.views.map((view) => view.id),
            ),
            eq(views.userId, context.user.id),
          ),
        );
    });
    await publishReconciliationInvalidation(
      context.user.id,
      organizationInvalidationSummary({
        scopes: { type: "known", selectors: [] },
      }),
    );
  });

export const deleteView = protectedProcedure
  .input(deleteViewSchema)
  .handler(async ({ context, input }) => {
    const result = await context.db
      .delete(views)
      .where(and(eq(views.id, input.id), eq(views.userId, context.user.id)));
    await publishReconciliationInvalidation(
      context.user.id,
      organizationInvalidationSummary(),
    );
    return result;
  });

export const getAll = protectedProcedure.handler(({ context }) =>
  loadApplicationViews(context.db, context.user.id),
);
