import { ResultSet } from "@libsql/client";
import { and, eq, ExtractTablesWithRelations } from "drizzle-orm";
import { SQLiteTransaction } from "drizzle-orm/sqlite-core";

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
