import { eq, asc, inArray, and } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure } from "~/server/orpc/base";
import { contentCategories, feedCategories } from "~/server/db/schema";

export const getAll = protectedProcedure.handler(async ({ context }) => {
  const contentCategoriesList = await context.db
    .select()
    .from(contentCategories)
    .where(eq(contentCategories.userId, context.user.id))
    .orderBy(asc(contentCategories.name));
  const categoryIds = contentCategoriesList.map(
    (contentCategory) => contentCategory.id,
  );

  const feedCategoriesList = await context.db
    .select()
    .from(feedCategories)
    .where(inArray(feedCategories.categoryId, categoryIds))
    .orderBy(asc(feedCategories.categoryId));

  return feedCategoriesList;
});

export const assignToFeed = protectedProcedure
  .input(z.object({ feedId: z.number(), categoryId: z.number() }))
  .handler(async ({ context, input }) => {
    await context.db.insert(feedCategories).values({
      feedId: input.feedId,
      categoryId: input.categoryId,
    });
  });

export const removeFromFeed = protectedProcedure
  .input(z.object({ feedId: z.number(), categoryId: z.number() }))
  .handler(async ({ context, input }) => {
    await context.db
      .delete(feedCategories)
      .where(
        and(
          eq(feedCategories.feedId, input.feedId),
          eq(feedCategories.categoryId, input.categoryId),
        ),
      );
  });
