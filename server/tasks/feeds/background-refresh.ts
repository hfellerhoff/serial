import { defineTask } from "nitro/task";
import { and, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { captureException } from "../../../src/server/logger";
import { db } from "../../../src/server/db";
import { feeds, user } from "../../../src/server/db/schema";
import { fetchAndInsertFeedData } from "../../../src/server/rss/fetchFeeds";
import { IS_MAIN_INSTANCE } from "../../../src/lib/constants";
import { IS_BILLING_ENABLED } from "../../../src/server/subscriptions/polar";
import { env } from "../../../src/env";

export default defineTask({
  meta: {
    name: "feeds:background-refresh",
    description: "Background refresh of active feeds for paid users",
  },
  async run() {
    const backgroundRefreshEnabled = env.BACKGROUND_REFRESH_ENABLED !== "false";

    if (!backgroundRefreshEnabled) {
      console.log(
        "[background-refresh] Disabled via BACKGROUND_REFRESH_ENABLED",
      );
      return { result: "disabled" };
    }

    const now = new Date();

    console.log("[background-refresh] Running at ", now.toLocaleString());

    // Determine eligible users first (cheap query on user table), then only
    // fetch feeds for those users. This avoids loading thousands of feeds
    // before knowing which users are actually eligible.
    let eligibleUserIds: string[] | null = null;

    if (IS_BILLING_ENABLED) {
      // With billing: only refresh feeds for users whose plan-based
      // nextRefreshAt has elapsed (or was never set).
      const eligibleUsers = await db
        .select({ id: user.id })
        .from(user)
        .where(or(lte(user.nextRefreshAt, now), isNull(user.nextRefreshAt)))
        .all();
      eligibleUserIds = eligibleUsers.map((u) => u.id);
    } else if (IS_MAIN_INSTANCE) {
      // Main instance without billing: only admin users.
      const admins = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.role, "admin"))
        .all();
      eligibleUserIds = admins.map((a) => a.id);
    }

    // Early exit if user filtering yielded no eligible users.
    if (eligibleUserIds !== null && eligibleUserIds.length === 0) {
      console.log("[background-refresh] No eligible users to refresh");
      return { result: "no-eligible-users" };
    }

    // Fetch only feeds belonging to eligible users that are due for refresh.
    // On self-hosted (eligibleUserIds is null), fetch all active feeds due,
    // including those with null nextFetchAt (never-scheduled feeds).
    const fetchAtCondition = IS_MAIN_INSTANCE
      ? lte(feeds.nextFetchAt, now)
      : or(lte(feeds.nextFetchAt, now), isNull(feeds.nextFetchAt));

    const userCondition =
      eligibleUserIds !== null
        ? inArray(feeds.userId, eligibleUserIds)
        : undefined;

    const feedsToRefresh = await db
      .select()
      .from(feeds)
      .where(and(eq(feeds.isActive, true), fetchAtCondition, userCondition))
      .all();

    if (feedsToRefresh.length === 0) {
      console.log("[background-refresh] No feeds to refresh");
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
    let totalRowsWritten = 0;
    let skippedCount = 0;
    let emptyCount = 0;
    let errorCount = 0;

    // Map feed ID → name for error logging
    const feedNameMap = new Map<number, string>();
    for (const userFeeds of feedsByUser.values()) {
      for (const feed of userFeeds) {
        feedNameMap.set(feed.id, feed.name);
      }
    }

    for (const [userId, userFeeds] of feedsByUser) {
      try {
        // Fetch and insert feed data
        for await (const result of fetchAndInsertFeedData({ db }, userFeeds)) {
          if (result.status === "success") {
            refreshedCount++;
            totalRowsWritten += result.feedItems.length;
          } else if (result.status === "skipped") {
            skippedCount++;
          } else if (result.status === "empty") {
            emptyCount++;
          } else if (result.status === "error") {
            errorCount++;
            const feedName = feedNameMap.get(result.id) ?? "unknown";
            const errMsg =
              result.error instanceof Error
                ? result.error.message
                : String(result.error);
            captureException(
              result.error instanceof Error ? result.error : new Error(errMsg),
              { feedId: result.id, feedName },
            );
            console.error(
              `[background-refresh] Error refreshing feed "${feedName}" (id=${result.id}, user=${userId}): ${errMsg}`,
            );
          }
        }
      } catch (e) {
        captureException(e);
        console.error(
          `[background-refresh] Failed to refresh feeds for user ${userId}:`,
          e,
        );
      }
    }

    console.log(
      `[background-refresh] Finished at ${new Date().toLocaleString()} — refreshed ${refreshedCount}, skipped ${skippedCount} (304/cached), empty ${emptyCount}, errors ${errorCount}, wrote ${totalRowsWritten} rows total`,
    );

    return {
      result: `refreshed ${refreshedCount}, skipped ${skippedCount}, empty ${emptyCount}, errors ${errorCount}, wrote ${totalRowsWritten} rows`,
    };
  },
});
