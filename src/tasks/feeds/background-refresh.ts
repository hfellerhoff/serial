import { defineTask } from "nitro/task";
import { and, eq, lte } from "drizzle-orm";
import { db } from "~/server/db";
import { feeds, user } from "~/server/db/schema";
import { fetchAndInsertFeedData } from "~/server/rss/fetchFeeds";
import { IS_MAIN_INSTANCE } from "~/lib/constants";

export default defineTask({
  meta: {
    name: "feeds:background-refresh",
    description: "Background refresh of active feeds for paid users",
  },
  async run() {
    const backgroundRefreshEnabled =
      process.env.BACKGROUND_REFRESH_ENABLED !== "false";

    if (!backgroundRefreshEnabled) {
      return { result: "disabled" };
    }

    const now = new Date();

    console.log("[background-refresh] Running at ", now.toLocaleString());

    // Find distinct userIds with active feeds that need refreshing
    const usersWithFeeds = await db
      .selectDistinct({ userId: feeds.userId })
      .from(feeds)
      .where(and(eq(feeds.isActive, true), lte(feeds.nextFetchAt, now)))
      .all();

    if (usersWithFeeds.length === 0) {
      return { result: "no-feeds-to-refresh" };
    }

    // On the main instance, only refresh feeds for admin users.
    // Paid users' feeds have nextFetchAt managed by subscription webhooks.
    let adminUserIds: Set<string> | null = null;
    if (IS_MAIN_INSTANCE) {
      const admins = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.role, "admin"))
        .all();
      adminUserIds = new Set(admins.map((a) => a.id));
    }

    let refreshedCount = 0;

    for (const { userId } of usersWithFeeds) {
      try {
        if (adminUserIds && !adminUserIds.has(userId)) {
          continue;
        }

        // Get active feeds that need refreshing for this user
        const userFeeds = await db
          .select()
          .from(feeds)
          .where(
            and(
              eq(feeds.userId, userId),
              eq(feeds.isActive, true),
              lte(feeds.nextFetchAt, now),
            ),
          )
          .all();

        if (userFeeds.length === 0) continue;

        // Fetch and insert feed data
        for await (const result of fetchAndInsertFeedData({ db }, userFeeds)) {
          if (result.status === "success") {
            refreshedCount++;
          }
        }
      } catch (e) {
        console.error(
          `[background-refresh] Failed to refresh feeds for user ${userId}:`,
          e,
        );
      }
    }

    console.log(
      "[background-refresh] Finished at ",
      new Date().toLocaleString(),
    );

    return { result: `refreshed ${refreshedCount} feeds` };
  },
});
