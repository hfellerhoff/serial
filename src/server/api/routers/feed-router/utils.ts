import { and, eq, inArray } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { ResultSet } from "@libsql/client";
import type { SQLiteTransaction } from "drizzle-orm/sqlite-core";

import type { ApplicationFeed } from "~/server/db/schema";
import * as schema from "~/server/db/schema";
import { fetchNewFeedDetails } from "~/server/rss/fetchFeeds";
import { parseArrayOfSchema } from "~/lib/schemas/utils";

type SerialSchema = typeof schema;

type Transaction = SQLiteTransaction<
  "async",
  ResultSet,
  SerialSchema,
  ExtractTablesWithRelations<SerialSchema>
>;

export async function findExistingFeedThatMatches(
  tx: Transaction,
  data: {
    feedUrl: string;
    userId: string;
  },
) {
  return await tx.query.feeds.findFirst({
    where: and(
      eq(schema.feeds.url, data.feedUrl),
      eq(schema.feeds.userId, data.userId),
    ),
  });
}

export async function verifyFeedsOwnedByUser({
  feedIds,
  userId,
  db,
}: {
  feedIds: number[];
  userId: string;
  db: Transaction;
}): Promise<boolean> {
  if (feedIds.length === 0) {
    return true;
  }

  const userFeeds = await db
    .select({ id: schema.feeds.id })
    .from(schema.feeds)
    .where(
      and(inArray(schema.feeds.id, feedIds), eq(schema.feeds.userId, userId)),
    );

  return userFeeds.length === feedIds.length;
}

export async function verifyViewsOwnedByUser({
  viewIds,
  userId,
  db,
}: {
  viewIds: number[];
  userId: string;
  db: Transaction;
}): Promise<boolean> {
  if (viewIds.length === 0) {
    return true;
  }

  const userViews = await db
    .select({ id: schema.views.id })
    .from(schema.views)
    .where(
      and(inArray(schema.views.id, viewIds), eq(schema.views.userId, userId)),
    );

  return userViews.length === viewIds.length;
}

export async function verifyContentCategoriesOwnedByUser({
  categoryIds,
  userId,
  db,
}: {
  categoryIds: number[];
  userId: string;
  db: Transaction;
}): Promise<boolean> {
  if (categoryIds.length === 0) {
    return true;
  }

  const userCategories = await db
    .select({ id: schema.contentCategories.id })
    .from(schema.contentCategories)
    .where(
      and(
        inArray(schema.contentCategories.id, categoryIds),
        eq(schema.contentCategories.userId, userId),
      ),
    );

  return userCategories.length === categoryIds.length;
}

export type InsertFeedWithCategoriesSuccess = {
  success: true;
  feedId: number;
  feed: ApplicationFeed;
};

export type InsertFeedWithCategoriesError = {
  success: false;
  error: string;
};

export type InsertFeedWithCategoriesResult =
  | InsertFeedWithCategoriesSuccess
  | InsertFeedWithCategoriesError;

/**
 * Insert a feed with its categories, handling both existing and new categories.
 * This is the core logic extracted from createFromSubscriptionImport.
 */
export async function insertFeedWithCategories(
  db: Transaction,
  userId: string,
  feedInput: { feedUrl: string; categories: string[] },
  isActive: boolean = true,
): Promise<InsertFeedWithCategoriesResult> {
  const newFeedDetails = await fetchNewFeedDetails(feedInput.feedUrl);
  const newFeed = newFeedDetails[0];

  if (!newFeed?.url) {
    return {
      success: false,
      error: "Unsupported feed URL",
    };
  }

  const existingFeed = await findExistingFeedThatMatches(db, {
    feedUrl: newFeed.url,
    userId,
  });

  if (existingFeed) {
    return {
      success: false,
      error: "Feed already exists",
    };
  }

  const newFeeds = await db
    .insert(schema.feeds)
    .values({
      userId,
      ...newFeed,
      isActive,
      openLocation: schema.PLATFORM_DEFAULT_OPEN_LOCATION[newFeed.platform],
    })
    .returning();
  const newFeedRow = newFeeds[0];

  if (!newFeedRow) {
    return {
      success: false,
      error: "Couldn't find new feed",
    };
  }

  if (feedInput.categories.length > 0) {
    const matchingCategories = await db
      .select()
      .from(schema.contentCategories)
      .where(
        and(
          inArray(schema.contentCategories.name, feedInput.categories),
          eq(schema.contentCategories.userId, userId),
        ),
      )
      .all();

    const matchingCategoryNames = new Set(
      matchingCategories.map((category) => category.name),
    );

    const nonMatchingCategoryNames = feedInput.categories.filter(
      (category) => !matchingCategoryNames.has(category),
    );

    let newCategories: Array<{ id: number }> = [];
    if (nonMatchingCategoryNames.length > 0) {
      newCategories = await db
        .insert(schema.contentCategories)
        .values(
          nonMatchingCategoryNames.map((name) => ({
            name,
            userId,
          })),
        )
        .returning({ id: schema.contentCategories.id });
    }

    const feedCategoryValues = [
      ...matchingCategories.map((c) => ({
        feedId: newFeedRow.id,
        categoryId: c.id,
      })),
      ...newCategories.map((c) => ({
        feedId: newFeedRow.id,
        categoryId: c.id,
      })),
    ];

    if (feedCategoryValues.length > 0) {
      await db.insert(schema.feedCategories).values(feedCategoryValues);
    }
  }

  // Parse the feed to ApplicationFeed format
  const [applicationFeed] = parseArrayOfSchema(
    [newFeedRow],
    schema.feedsSchema,
  );

  return {
    success: true,
    feedId: newFeedRow.id,
    feed: applicationFeed!,
  };
}
