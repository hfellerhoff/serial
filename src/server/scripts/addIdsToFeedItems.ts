import "dotenv/config";

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import * as schema from "~/server/db/schema";
import { db } from "../db";

import { createId } from "@paralleldrive/cuid2";

const PAGE_SIZE = 1000;

async function migrate() {
  let feedItemsMigrated = 0;

  const countQuery = await db
    .select({
      count: sql`COUNT(${schema.feedItems.contentId})`,
    })
    .from(schema.feedItems)
    .where(isNull(schema.feedItems.id))
    .all();

  const itemCount = countQuery[0]!.count as number;
  console.log(`${itemCount} items to migrate...`);

  await db.transaction(async (tx) => {
    let offset = 0;
    let isFinished = false;

    while (!isFinished) {
      const feedItems = await tx
        .select()
        .from(schema.feedItems)
        .where(isNull(schema.feedItems.id))
        .orderBy(desc(schema.feedItems.createdAt))
        .limit(PAGE_SIZE)
        .all();

      console.log(`Migrating items ${offset} to ${offset + PAGE_SIZE}...`);
      offset += PAGE_SIZE;

      if (!feedItems.length) {
        isFinished = true;
        return;
      }

      await Promise.all(
        feedItems.map(async (feedItem) => {
          try {
            const res = await tx
              .update(schema.feedItems)
              .set({
                id: createId(),
              })
              .where(
                and(
                  eq(schema.feedItems.contentId, feedItem.contentId),
                  eq(schema.feedItems.feedId, feedItem.feedId ?? 0),
                ),
              );
            feedItemsMigrated += 1;
            return res;
          } catch {}
          return true;
        }),
      );
    }
  });

  console.log(`Migrated ${feedItemsMigrated} rows!`);
}

migrate();
