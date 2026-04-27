import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { getEffectivePlanConfig } from "./plans";
import { IS_BILLING_ENABLED } from "./polar";
import { getSubscriptionFromKV, syncPolarDataToKV } from "./kv";
import type { PlanId } from "./plans";
import type { db as Database } from "~/server/db";
import { feeds, user } from "~/server/db/schema";

type DB = typeof Database;

export async function getActiveFeedCount(db: DB, userId: string) {
  const result = await db
    .select({ count: count() })
    .from(feeds)
    .where(and(eq(feeds.userId, userId), eq(feeds.isActive, true)))
    .get();
  return result?.count ?? 0;
}

export async function getUserPlanId(userId: string): Promise<PlanId> {
  if (!IS_BILLING_ENABLED) return "pro";

  // 1. Try KV cache first (fast, shared across instances)
  try {
    const cached = await getSubscriptionFromKV(userId);
    if (cached) {
      return cached.planId;
    }
  } catch {
    // KV read failed, fall through to sync
  }

  // 2. KV miss — sync from Polar and write to KV
  try {
    const data = await syncPolarDataToKV(userId);
    return data.planId;
  } catch (e) {
    console.error(
      `[subscription] Failed to fetch plan for user ${userId}, defaulting to free:`,
      e,
    );
    return "free";
  }
}

/** Check if a user is an admin. */
export async function isAdminUser(db: DB, userId: string): Promise<boolean> {
  const row = await db
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, userId))
    .get();
  return row?.role === "admin";
}

export async function canActivateFeed(db: DB, userId: string) {
  const [planId, isAdmin] = await Promise.all([
    getUserPlanId(userId),
    isAdminUser(db, userId),
  ]);
  const config = getEffectivePlanConfig(planId, { isAdmin });
  const activeCount = await getActiveFeedCount(db, userId);
  return activeCount < config.maxActiveFeeds;
}

export async function getFeedsActivationBudget(db: DB, userId: string) {
  const [planId, isAdmin] = await Promise.all([
    getUserPlanId(userId),
    isAdminUser(db, userId),
  ]);
  const config = getEffectivePlanConfig(planId, { isAdmin });
  const activeCount = await getActiveFeedCount(db, userId);
  const remainingSlots = Math.max(0, config.maxActiveFeeds - activeCount);
  return { remainingSlots, maxActiveFeeds: config.maxActiveFeeds };
}

export async function getUserPlanLimits(db: DB, userId: string) {
  const [planId, isAdmin] = await Promise.all([
    getUserPlanId(userId),
    isAdminUser(db, userId),
  ]);
  const config = getEffectivePlanConfig(planId, { isAdmin });
  const activeFeeds = await getActiveFeedCount(db, userId);

  return {
    planId: config.id,
    planName: config.name,
    maxActiveFeeds:
      config.maxActiveFeeds === Infinity ? -1 : config.maxActiveFeeds,
    activeFeeds,
    refreshIntervalMs: config.refreshIntervalMs,
    backgroundRefreshIntervalMs: config.backgroundRefreshIntervalMs,
    billingEnabled: IS_BILLING_ENABLED,
  };
}

/**
 * Check if the user is eligible to refresh based on their plan's refresh interval.
 * Uses an atomic compare-and-swap UPDATE to avoid TOCTOU races under concurrent requests.
 */
export async function checkUserRefreshEligibility(
  db: DB,
  userId: string,
): Promise<
  | { eligible: true; nextRefreshAt: Date }
  | { eligible: false; nextRefreshAt: Date }
> {
  const [planId, isAdmin] = await Promise.all([
    getUserPlanId(userId),
    isAdminUser(db, userId),
  ]);
  const config = getEffectivePlanConfig(planId, { isAdmin });

  const now = new Date();
  const nowEpoch = Math.floor(now.getTime() / 1000);
  const nextRefreshAt = new Date(now.getTime() + config.refreshIntervalMs);

  // Atomic: only update nextRefreshAt if the current value is null or in the past.
  // If a concurrent request already claimed this window, rowsAffected will be 0.
  const result = await db
    .update(user)
    .set({ nextRefreshAt })
    .where(
      and(
        eq(user.id, userId),
        sql`(${user.nextRefreshAt} IS NULL OR ${user.nextRefreshAt} <= ${nowEpoch})`,
      ),
    );

  const rowsAffected = result.rowsAffected ?? 0;
  if (rowsAffected > 0) {
    return { eligible: true, nextRefreshAt };
  }

  // Rate-limited — read back the current nextRefreshAt to report to the user
  const userRow = await db
    .select({ nextRefreshAt: user.nextRefreshAt })
    .from(user)
    .where(eq(user.id, userId))
    .get();

  return {
    eligible: false,
    nextRefreshAt: userRow?.nextRefreshAt ?? nextRefreshAt,
  };
}

export async function deactivateExcessFeeds(
  db: DB,
  userId: string,
  maxActive: number,
) {
  const activeFeeds = await db
    .select({ id: feeds.id })
    .from(feeds)
    .where(and(eq(feeds.userId, userId), eq(feeds.isActive, true)))
    .orderBy(asc(feeds.lastFetchedAt))
    .all();

  if (activeFeeds.length <= maxActive) return;

  const feedsToDeactivate = activeFeeds.slice(maxActive);

  if (feedsToDeactivate.length === 0) return;

  await db
    .update(feeds)
    .set({ isActive: false })
    .where(
      and(
        eq(feeds.userId, userId),
        inArray(
          feeds.id,
          feedsToDeactivate.map((f) => f.id),
        ),
      ),
    );
}
