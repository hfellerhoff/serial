import "dotenv/config";

import * as schema from "~/server/db/schema";
import { eq, isNull } from "drizzle-orm";
import { db } from "../db";

import { createId } from "@paralleldrive/cuid2";

async function migrate() {
  let feedItemsMigrated = 0;

  await db.transaction(async (tx) => {
    const feedItems = await tx
      .select()
      .from(schema.feedItems)
      .where(isNull(schema.feedItems.id))
      .all();

    return await Promise.all(
      feedItems.map(async (feedItem) => {
        feedItemsMigrated += 1;
        return await tx
          .update(schema.feedItems)
          .set({
            id: createId(),
          })
          .where(eq(schema.feedItems.contentId, feedItem.contentId));
      }),
    );
  });

  console.log(`Migrated ${feedItemsMigrated} rows!`);
}

migrate();
