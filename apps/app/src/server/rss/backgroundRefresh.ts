import { and, asc, count, eq, gt, isNull, lte, or } from "drizzle-orm";
import { refreshUserFeeds } from "./refreshUserFeeds";
import type { PlanId } from "~/server/subscriptions/plans";
import type { DatabaseFeed } from "~/server/db/schema";
import type { db as Database } from "~/server/db";
import type { RefreshStats } from "./refreshUserFeeds";
import type { NavigationSnapshot } from "~/server/navigation/snapshot";
import {
  checkUserRefreshEligibilityForPlan,
  getUserPlanId,
} from "~/server/subscriptions/helpers";
import { feeds, user } from "~/server/db/schema";
import { workerPool } from "~/lib/workerPool";
import { queryNavigationSnapshot } from "~/server/navigation/snapshot";

export const BACKGROUND_USER_PAGE_SIZE = 25;
export const BACKGROUND_FEED_PAGE_SIZE = 50;
export const BACKGROUND_PLAN_CONCURRENCY = 4;

type UserCandidate = {
  id: string;
  role: string | null;
};

type RefreshLifecycleChunk =
  | { type: "refresh-start"; totalFeeds: number; nextRefreshAt: Date }
  | { type: "navigation-snapshot"; snapshot: NavigationSnapshot }
  | { type: "refresh-complete" };

type RefreshEligibility =
  | { eligible: true; nextRefreshAt: Date }
  | { eligible: false; nextRefreshAt: Date };

type BackgroundRefreshDependencies = {
  db: typeof Database;
  now: Date;
  billingEnabled: boolean;
  hasSubscribers: (channel: string) => boolean;
  claimUser?: (input: {
    db: typeof Database;
    userId: string;
    planId: PlanId;
    isAdmin: boolean;
  }) => Promise<RefreshEligibility>;
  getPlanId?: (userId: string) => Promise<PlanId>;
  publish: (channel: string, chunk: RefreshLifecycleChunk) => Promise<void>;
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

const EMPTY_STATS: RefreshStats = {
  refreshedCount: 0,
  skippedCount: 0,
  emptyCount: 0,
  errorCount: 0,
  totalRowsWritten: 0,
};

function addRefreshStats(target: RefreshStats, source: RefreshStats) {
  target.refreshedCount += source.refreshedCount;
  target.skippedCount += source.skippedCount;
  target.emptyCount += source.emptyCount;
  target.errorCount += source.errorCount;
  target.totalRowsWritten += source.totalRowsWritten;
}

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

async function countDueFeeds(db: typeof Database, userId: string, now: Date) {
  const result = await db
    .select({ value: count() })
    .from(feeds)
    .where(
      and(
        eq(feeds.userId, userId),
        eq(feeds.isActive, true),
        or(lte(feeds.nextFetchAt, now), isNull(feeds.nextFetchAt)),
      ),
    )
    .get();
  return result?.value ?? 0;
}

async function getDueFeedPage(
  db: typeof Database,
  input: { userId: string; afterFeedId?: number; now: Date },
) {
  return db
    .select()
    .from(feeds)
    .where(
      and(
        eq(feeds.userId, input.userId),
        eq(feeds.isActive, true),
        or(lte(feeds.nextFetchAt, input.now), isNull(feeds.nextFetchAt)),
        input.afterFeedId ? gt(feeds.id, input.afterFeedId) : undefined,
      ),
    )
    .orderBy(asc(feeds.id))
    .limit(BACKGROUND_FEED_PAGE_SIZE)
    .all();
}

export async function runBackgroundFeedRefresh(
  dependencies: BackgroundRefreshDependencies,
): Promise<BackgroundRefreshMetrics> {
  const metrics: BackgroundRefreshMetrics = {
    ...EMPTY_STATS,
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

    const subscribedUsers = userPage.filter((candidate) =>
      dependencies.hasSubscribers(`user:${candidate.id}`),
    );
    const planCandidates = dependencies.billingEnabled
      ? workerPool(
          subscribedUsers,
          BACKGROUND_PLAN_CONCURRENCY,
          async (candidate) => ({
            candidate,
            planId: await getPlanId(candidate.id),
          }),
        )
      : workerPool(subscribedUsers, BACKGROUND_PLAN_CONCURRENCY, (candidate) =>
          Promise.resolve({
            candidate,
            planId: "pro" as const,
          }),
        );

    for await (const { candidate, planId } of planCandidates) {
      if (dependencies.billingEnabled && planId === "free") continue;

      const channel = `user:${candidate.id}`;
      let refreshStarted = false;
      try {
        const dueFeedCount = await countDueFeeds(
          dependencies.db,
          candidate.id,
          dependencies.now,
        );
        if (!dependencies.billingEnabled && dueFeedCount === 0) continue;

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
          addRefreshStats(metrics, pageStats);
        }

        await dependencies.publish(channel, {
          type: "navigation-snapshot",
          snapshot: await queryNavigationSnapshot({
            database: dependencies.db,
            userId: candidate.id,
          }),
        });
      } catch (error) {
        metrics.errorCount++;
        dependencies.onUserError?.(error, candidate.id);
      } finally {
        if (refreshStarted) {
          try {
            await dependencies.publish(channel, { type: "refresh-complete" });
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
