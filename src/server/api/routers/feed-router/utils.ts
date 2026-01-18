import type { ResultSet } from "@libsql/client";
import { and, eq, inArray, type ExtractTablesWithRelations } from "drizzle-orm";
import type { SQLiteTransaction } from "drizzle-orm/sqlite-core";

import * as schema from "~/server/db/schema";
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
      and(
        inArray(schema.feeds.id, feedIds),
        eq(schema.feeds.userId, userId),
      ),
    );

  return userFeeds.length === feedIds.length;
}
