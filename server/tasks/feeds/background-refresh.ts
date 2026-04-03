import { defineTask } from "nitro/task";
import { and, eq, lte } from "drizzle-orm";
import { db } from "../../../src/server/db";
import { feeds, user } from "../../../src/server/db/schema";
import { fetchAndInsertFeedData } from "../../../src/server/rss/fetchFeeds";
import { IS_MAIN_INSTANCE } from "../../../src/lib/constants";

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

    // Fetch all active feeds that need refreshing in a single query
    const allFeedsDue = await db
      .select()
      .from(feeds)
      .where(and(eq(feeds.isActive, true), lte(feeds.nextFetchAt, now)))
      .all();

    // Filter to admin users if on main instance
    const feedsToRefresh = adminUserIds
      ? allFeedsDue.filter((f) => adminUserIds.has(f.userId))
      : allFeedsDue;

    if (feedsToRefresh.length === 0) {
      return { result: "no-feeds-to-refresh" };
    }

    // Group feeds by userId for per-user processing
    const feedsByUser = new Map<string, typeof feedsToRefresh>();
    for (const feed of feedsToRefresh) {
      const existing = feedsByUser.get(feed.userId);
      if (existing) {
        existing.push(feed);
      } else {
        feedsByUser.set(feed.userId, [feed]);
      }
    }

    let refreshedCount = 0;

    for (const [userId, userFeeds] of feedsByUser) {
      try {
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
