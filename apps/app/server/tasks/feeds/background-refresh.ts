import { defineTask } from "nitro/task";
import { hasSubscribers, publisher } from "../../../src/server/api/publisher";
import { db } from "../../../src/server/db";
import {
  captureException,
  logError,
  logMessage,
} from "../../../src/server/logger";
import { runBackgroundFeedRefresh } from "../../../src/server/rss/backgroundRefresh";
import { IS_BILLING_ENABLED } from "../../../src/server/subscriptions/polar";
import { env } from "../../../src/env";

export default defineTask({
  meta: {
    name: "feeds:background-refresh",
    description: "Background refresh of active feeds for paid users",
  },
  async run() {
    if (!env.BACKGROUND_REFRESH_ENABLED) {
      logMessage(
        "[background-refresh] Disabled via BACKGROUND_REFRESH_ENABLED",
      );
      return { result: "disabled" };
    }

    const now = new Date();
    logMessage("[background-refresh] Running at ", now.toLocaleString());

    const metrics = await runBackgroundFeedRefresh({
      db,
      now,
      billingEnabled: IS_BILLING_ENABLED,
      hasSubscribers,
      publish: async (channel, chunk) => {
        await publisher.publish(channel, {
          source: "initial",
          chunk,
        });
      },
      onUserError: (error, userId) => {
        captureException(
          error instanceof Error
            ? error
            : new Error(
                `[background-refresh] Failed to refresh feeds for user ${userId}`,
              ),
          { userId },
        );
        logError(
          `[background-refresh] Failed to refresh feeds for user ${userId}:`,
          error,
        );
      },
    });

    logMessage(
      `[background-refresh] Finished at ${new Date().toLocaleString()} — refreshed ${metrics.refreshedCount}, skipped ${metrics.skippedCount} (304/cached), empty ${metrics.emptyCount}, errors ${metrics.errorCount}, wrote ${metrics.totalRowsWritten} rows; claimed ${metrics.usersClaimed} users in ${metrics.userPages} pages and ${metrics.totalDueFeeds} Feeds in ${metrics.feedPages} pages (max user page ${metrics.maximumUserPageSize}, max Feed page ${metrics.maximumFeedPageSize}, plan workers ${metrics.planConcurrency})`,
    );

    return {
      result: `refreshed ${metrics.refreshedCount}, skipped ${metrics.skippedCount}, empty ${metrics.emptyCount}, errors ${metrics.errorCount}, wrote ${metrics.totalRowsWritten} rows; users ${metrics.usersClaimed}/${metrics.userPages} pages, feeds ${metrics.totalDueFeeds}/${metrics.feedPages} pages`,
    };
  },
});
