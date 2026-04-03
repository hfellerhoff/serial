import { and, asc, count, eq, inArray } from "drizzle-orm";
import { determinePlanFromProductId, getEffectivePlanConfig } from "./plans";
import { IS_BILLING_ENABLED, polarClient } from "./polar";
import type { PlanId } from "./plans";
import type { db as Database } from "~/server/db";
import { feeds } from "~/server/db/schema";

type DB = typeof Database;

const PLAN_CACHE_TTL_MS = 60_000 * 4; // 4 minutes
const planCache = new Map<string, { planId: PlanId; expiresAt: number }>();

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

  const cached = planCache.get(userId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.planId;
  }

  try {
    // Look up active subscriptions by externalCustomerId (Better Auth sets this to user ID)
    const subscriptions = await polarClient!.subscriptions.list({
      externalCustomerId: [userId],
      active: true,
    });

    const activeSub = subscriptions.result?.items?.[0];
    const planId: PlanId = activeSub?.productId
      ? (determinePlanFromProductId(activeSub.productId) ?? "free")
      : "free";

    planCache.set(userId, {
      planId,
      expiresAt: Date.now() + PLAN_CACHE_TTL_MS,
    });

    return planId;
  } catch (e) {
    // On failure, prefer the last-known plan over defaulting to free —
    // a Polar outage shouldn't downgrade paid users mid-session.
    if (cached) {
      console.warn(
        `[subscription] Polar API failed for user ${userId}, using cached plan "${cached.planId}":`,
        e,
      );
      return cached.planId;
    }

    console.error(
      `[subscription] Failed to fetch plan for user ${userId}, no cached value, defaulting to free:`,
      e,
    );
    return "free";
  }
}

/** Evict the cached plan for a user (e.g. after a webhook updates their subscription). */
export function invalidatePlanCache(userId: string) {
  planCache.delete(userId);
}

export async function canActivateFeed(db: DB, userId: string) {
  const planId = await getUserPlanId(userId);
  const config = getEffectivePlanConfig(planId);
  const activeCount = await getActiveFeedCount(db, userId);
  return activeCount < config.maxActiveFeeds;
}

export async function getFeedsActivationBudget(db: DB, userId: string) {
  const planId = await getUserPlanId(userId);
  const config = getEffectivePlanConfig(planId);
  const activeCount = await getActiveFeedCount(db, userId);
  const remainingSlots = Math.max(0, config.maxActiveFeeds - activeCount);
  return { remainingSlots, maxActiveFeeds: config.maxActiveFeeds };
}

export async function getUserPlanLimits(db: DB, userId: string) {
  const planId = await getUserPlanId(userId);
  const config = getEffectivePlanConfig(planId);
  const activeFeeds = await getActiveFeedCount(db, userId);

  return {
    planId: config.id,
    planName: config.name,
    maxActiveFeeds:
      config.maxActiveFeeds === Infinity ? -1 : config.maxActiveFeeds,
    activeFeeds,
    backgroundRefreshIntervalMs: config.backgroundRefreshIntervalMs,
    billingEnabled: IS_BILLING_ENABLED,
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
