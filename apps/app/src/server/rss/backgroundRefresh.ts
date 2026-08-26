import { and, asc, gt, isNull, lte, or } from "drizzle-orm";
import { refreshUserFeeds } from "./refreshUserFeeds";
import { addRefreshStats, emptyRefreshStats, rssAttemptSummary } from "./stats";
import { countDueFeeds, getDueFeedPage, RSS_FEED_PAGE_SIZE } from "./dueFeeds";
import { automaticRssOwnerForPlan } from "./automaticOwnership";
import type { PlanId } from "~/server/subscriptions/plans";
import type { DatabaseFeed } from "~/server/db/schema";
import type { db as Database } from "~/server/db";
import type { RefreshStats } from "./stats";
import type { RssAttemptOutcome, RssPublishedChunk } from "~/lib/rss";
import {
  checkUserRefreshEligibilityForPlan,
  getUserPlanId,
} from "~/server/subscriptions/helpers";
import { user } from "~/server/db/schema";
import { workerPool } from "~/lib/workerPool";

export const BACKGROUND_USER_PAGE_SIZE = 25;
export const BACKGROUND_FEED_PAGE_SIZE = RSS_FEED_PAGE_SIZE;
export const BACKGROUND_PLAN_CONCURRENCY = 4;

type UserCandidate = {
  id: string;
  role: string | null;
};

type RefreshEligibility =
  | { eligible: true; nextRefreshAt: Date }
  | { eligible: false; nextRefreshAt: Date };

type BackgroundRefreshDependencies = {
  db: typeof Database;
  now: Date;
  billingEnabled: boolean;
  claimUser?: (input: {
    db: typeof Database;
    userId: string;
    planId: PlanId;
    isAdmin: boolean;
  }) => Promise<RefreshEligibility>;
  getPlanId?: (userId: string) => Promise<PlanId>;
  publish: (channel: string, chunk: RssPublishedChunk) => Promise<void>;
  refreshFeedPage?: (input: {
    db: typeof Database;
    feedsList: DatabaseFeed[];
    channel: string;
  }) => Promise<RefreshStats>;
  onUserError?: (error: unknown, userId: string) => void;
};

export type BackgroundRefreshMetrics = RefreshStats & {
  userPages: number;
  feedPages: number;
  usersClaimed: number;
  totalDueFeeds: number;
  maximumUserPageSize: number;
  maximumFeedPageSize: number;
  planConcurrency: number;
};

async function getDueUserPage(
  db: typeof Database,
  input: {
    afterUserId?: string;
    billingEnabled: boolean;
    now: Date;
  },
): Promise<UserCandidate[]> {
  const afterCondition = input.afterUserId
    ? gt(user.id, input.afterUserId)
    : undefined;

  if (input.billingEnabled) {
    return db
      .select({ id: user.id, role: user.role })
      .from(user)
      .where(
        and(
          or(lte(user.nextRefreshAt, input.now), isNull(user.nextRefreshAt)),
          afterCondition,
        ),
      )
      .orderBy(asc(user.id))
      .limit(BACKGROUND_USER_PAGE_SIZE)
      .all();
  }

  return db
    .select({ id: user.id, role: user.role })
    .from(user)
    .where(afterCondition)
    .orderBy(asc(user.id))
    .limit(BACKGROUND_USER_PAGE_SIZE)
    .all();
}

export async function runBackgroundFeedRefresh(
  dependencies: BackgroundRefreshDependencies,
): Promise<BackgroundRefreshMetrics> {
  const metrics: BackgroundRefreshMetrics = {
    ...emptyRefreshStats(),
    userPages: 0,
    feedPages: 0,
    usersClaimed: 0,
    totalDueFeeds: 0,
    maximumUserPageSize: 0,
    maximumFeedPageSize: 0,
    planConcurrency: BACKGROUND_PLAN_CONCURRENCY,
  };
  const getPlanId = dependencies.getPlanId ?? getUserPlanId;
  const claimUser =
    dependencies.claimUser ??
    ((input) =>
      checkUserRefreshEligibilityForPlan(input.db, input.userId, input.planId, {
        isAdmin: input.isAdmin,
      }));
  const refreshFeedPage = dependencies.refreshFeedPage ?? refreshUserFeeds;
  let afterUserId: string | undefined;

  while (true) {
    const userPage = await getDueUserPage(dependencies.db, {
      afterUserId,
      billingEnabled: dependencies.billingEnabled,
      now: dependencies.now,
    });
    if (userPage.length === 0) break;

    metrics.userPages++;
    metrics.maximumUserPageSize = Math.max(
      metrics.maximumUserPageSize,
      userPage.length,
    );
    afterUserId = userPage.at(-1)?.id;

    const planCandidates = dependencies.billingEnabled
      ? workerPool(
          userPage,
          BACKGROUND_PLAN_CONCURRENCY,
          async (candidate) => ({
            candidate,
            planId: await getPlanId(candidate.id),
          }),
        )
      : workerPool(userPage, BACKGROUND_PLAN_CONCURRENCY, (candidate) =>
          Promise.resolve({
            candidate,
            planId: "pro" as const,
          }),
        );

    for await (const { candidate, planId } of planCandidates) {
      if (
        automaticRssOwnerForPlan({
          backgroundRefreshEnabled: true,
          planId,
          isAdmin: candidate.role === "admin",
        }) !== "background-task"
      ) {
        continue;
      }

      const channel = `user:${candidate.id}`;
      let refreshStarted = false;
      let outcome: RssAttemptOutcome = "completed";
      const userStats = emptyRefreshStats();
      try {
        const dueFeedCount = await countDueFeeds(
          dependencies.db,
          candidate.id,
          dependencies.now,
        );
        // Nothing due: do not consume the user's refresh window or emit an
        // empty lifecycle for a no-op.
        if (dueFeedCount === 0) continue;

        const eligibility = await claimUser({
          db: dependencies.db,
          userId: candidate.id,
          planId,
          isAdmin: candidate.role === "admin",
        });
        if (!eligibility.eligible) continue;
        metrics.usersClaimed++;

        metrics.totalDueFeeds += dueFeedCount;
        await dependencies.publish(channel, {
          type: "refresh-start",
          totalFeeds: dueFeedCount,
          nextRefreshAt: eligibility.nextRefreshAt,
        });
        refreshStarted = true;

        let afterFeedId: number | undefined;
        while (true) {
          const feedPage = await getDueFeedPage(dependencies.db, {
            userId: candidate.id,
            afterFeedId,
            now: dependencies.now,
          });
          if (feedPage.length === 0) break;

          metrics.feedPages++;
          metrics.maximumFeedPageSize = Math.max(
            metrics.maximumFeedPageSize,
            feedPage.length,
          );
          afterFeedId = feedPage.at(-1)?.id;
          const pageStats = await refreshFeedPage({
            db: dependencies.db,
            feedsList: feedPage,
            channel,
          });
          addRefreshStats(userStats, pageStats);
          addRefreshStats(metrics, pageStats);
        }
        outcome = userStats.errorCount > 0 ? "partial" : "completed";
      } catch (error) {
        outcome = "failed";
        metrics.errorCount++;
        dependencies.onUserError?.(error, candidate.id);
      } finally {
        if (refreshStarted) {
          try {
            await dependencies.publish(channel, {
              type: "rss-attempt-complete",
              ...rssAttemptSummary(userStats, outcome),
            });
          } catch (error) {
            metrics.errorCount++;
            dependencies.onUserError?.(error, candidate.id);
          }
        }
      }
    }
  }

  return metrics;
}
