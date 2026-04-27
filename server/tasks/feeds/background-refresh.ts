import { defineTask } from "nitro/task";
import { and, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "../../../src/server/db";
import { feeds, user } from "../../../src/server/db/schema";
import { refreshUserFeeds } from "../../../src/server/rss/refreshUserFeeds";
import { hasSubscribers, publisher } from "../../../src/server/api/publisher";
import {
  checkUserRefreshEligibility,
  getUserPlanId,
} from "../../../src/server/subscriptions/helpers";
import { IS_BILLING_ENABLED } from "../../../src/server/subscriptions/polar";
import { captureException } from "../../../src/server/logger";
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
      // With billing: users whose plan-based nextRefreshAt has elapsed
      // (or was never set). Admin users naturally qualify because they
      // get UNLIMITED_CONFIG with the shortest refresh interval.
      const eligibleUsers = await db
        .select({ id: user.id })
        .from(user)
        .where(or(lte(user.nextRefreshAt, now), isNull(user.nextRefreshAt)))
        .all();

      // Exclude free users — they don't have background refresh.
      const userPlans = await Promise.all(
        eligibleUsers.map(async (u) => ({
          id: u.id,
          planId: await getUserPlanId(u.id),
        })),
      );
      eligibleUserIds = userPlans
        .filter((u) => u.planId !== "free")
        .map((u) => u.id);
    }
    // Without billing: eligibleUserIds stays null → all active feeds

    // Early exit if user filtering yielded no eligible users.
    if (eligibleUserIds !== null && eligibleUserIds.length === 0) {
      console.log("[background-refresh] No eligible users to refresh");
      return { result: "no-eligible-users" };
    }

    // Fetch feeds belonging to eligible users that are due for refresh.
    // Include feeds with null nextFetchAt (never-scheduled feeds) so they
    // get picked up on first pass.
    const fetchAtCondition = or(
      lte(feeds.nextFetchAt, now),
      isNull(feeds.nextFetchAt),
    );

    const userCondition =
      eligibleUserIds !== null
        ? inArray(feeds.userId, eligibleUserIds)
        : undefined;

    const feedsToRefresh = await db
      .select()
      .from(feeds)
      .where(and(eq(feeds.isActive, true), fetchAtCondition, userCondition))
      .all();

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

    // Build the full set of user IDs to process. Every eligible user gets
    // refresh-start / refresh-complete regardless of whether they have
    // feeds due, so the client always sees the loading state + cooldown.
    const userIdsToProcess =
      eligibleUserIds !== null ? eligibleUserIds : [...feedsByUser.keys()];

    if (userIdsToProcess.length === 0) {
      console.log("[background-refresh] No users to process");
      return { result: "no-users" };
    }

    let refreshedCount = 0;
    let totalRowsWritten = 0;
    let skippedCount = 0;
    let emptyCount = 0;
    let errorCount = 0;

    for (const userId of userIdsToProcess) {
      try {
        const channel = `user:${userId}`;

        // Skip users with no connected client — no one to receive the
        // chunks, and we avoid unnecessary RSS fetches + Redis publishes.
        if (!hasSubscribers(channel)) {
          continue;
        }

        const userFeeds = feedsByUser.get(userId);

        // Set the user's next refresh cooldown and publish refresh-start
        // immediately so the client enters loading state.
        const eligibility = await checkUserRefreshEligibility(db, userId);
        console.log(
          `[background-refresh] refresh-start for user ${userId} on "${channel}" — feeds: ${userFeeds?.length ?? 0}, nextRefreshAt: ${eligibility.nextRefreshAt.toISOString()}`,
        );

        await publisher.publish(channel, {
          source: "initial",
          chunk: {
            type: "refresh-start",
            totalFeeds: userFeeds?.length ?? 0,
            nextRefreshAt: eligibility.nextRefreshAt,
          },
        });

        // Run the actual RSS fetch (if this user has feeds due).
        if (userFeeds && userFeeds.length > 0) {
          const stats = await refreshUserFeeds({
            db,
            feedsList: userFeeds,
            channel,
          });

          refreshedCount += stats.refreshedCount;
          skippedCount += stats.skippedCount;
          emptyCount += stats.emptyCount;
          errorCount += stats.errorCount;
          totalRowsWritten += stats.totalRowsWritten;
        }

        // Always signal completion so the client exits loading state.
        await publisher.publish(channel, {
          source: "initial",
          chunk: { type: "refresh-complete" },
        });
      } catch (e) {
        captureException(
          e instanceof Error
            ? e
            : new Error(
                `[background-refresh] Failed to refresh feeds for user ${userId}`,
              ),
          { userId },
        );
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
