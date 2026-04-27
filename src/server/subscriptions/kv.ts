import { Redis } from "@upstash/redis";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  determinePlanFromProductId,
  IS_BILLING_ENABLED,
  polarClient,
} from "./polar";
import { getEffectivePlanConfig, PLANS } from "./plans";
import { deactivateExcessFeeds, isAdminUser } from "./helpers";
import type { PlanId } from "./plans";
import type { db as Database } from "~/server/db";
import { feeds, user } from "~/server/db/schema";
import { env } from "~/env";

type DB = typeof Database;

// ---------------------------------------------------------------------------
// Upstash client — null when billing is disabled or creds are missing.
// Consumers must handle null gracefully (fall through to Polar API).
// ---------------------------------------------------------------------------

const hasUpstashCredentials =
  !!env.UPSTASH_REDIS_REST_URL && !!env.UPSTASH_REDIS_REST_TOKEN;

export const redis =
  IS_BILLING_ENABLED && hasUpstashCredentials
    ? new Redis({
        url: env.UPSTASH_REDIS_REST_URL!,
        token: env.UPSTASH_REDIS_REST_TOKEN!,
      })
    : null;

// ---------------------------------------------------------------------------
// Cached subscription type — stored as JSON at `polar:sub:{userId}`
// ---------------------------------------------------------------------------

export type PolarSubscriptionCache = {
  planId: PlanId;
  status: string; // "active" | "trialing" | "past_due" | "canceled" | "none"
  subscriptionId: string | null;
  productId: string | null;
  recurringInterval: string | null; // "month" | "year"
  currentPeriodStart: string | null; // ISO string
  currentPeriodEnd: string | null; // ISO string
  cancelAtPeriodEnd: boolean;
  amount: number | null; // cents
  currency: string | null;
  syncedAt: string; // ISO timestamp of last sync
};

function kvKey(userId: string) {
  return `polar:sub:${userId}`;
}

const KV_TTL_SECONDS = 86_400; // 24 hours — safety net; active syncs keep data fresh

// ---------------------------------------------------------------------------
// syncPolarDataToKV — the single source-of-truth sync function.
// Fetches the latest subscription state from Polar and writes it to KV.
// ---------------------------------------------------------------------------

export async function syncPolarDataToKV(
  userId: string,
): Promise<PolarSubscriptionCache> {
  if (!polarClient) {
    throw new Error(
      "[kv] syncPolarDataToKV called but Polar client is not available",
    );
  }

  try {
    const subscriptions = await polarClient.subscriptions.list({
      externalCustomerId: [userId],
      active: true,
    });

    const activeSub = subscriptions.result?.items?.[0];

    let data: PolarSubscriptionCache;

    if (activeSub?.productId) {
      const planId = determinePlanFromProductId(activeSub.productId) ?? "free";

      data = {
        planId,
        status: activeSub.status ?? "active",
        subscriptionId: activeSub.id ?? null,
        productId: activeSub.productId,
        recurringInterval: activeSub.recurringInterval ?? null,
        currentPeriodStart: activeSub.currentPeriodStart
          ? new Date(activeSub.currentPeriodStart).toISOString()
          : null,
        currentPeriodEnd: activeSub.currentPeriodEnd
          ? new Date(activeSub.currentPeriodEnd).toISOString()
          : null,
        cancelAtPeriodEnd: activeSub.cancelAtPeriodEnd ?? false,
        amount: activeSub.amount ?? null,
        currency: activeSub.currency ?? null,
        syncedAt: new Date().toISOString(),
      };
    } else {
      data = {
        planId: "free",
        status: "none",
        subscriptionId: null,
        productId: null,
        recurringInterval: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        amount: null,
        currency: null,
        syncedAt: new Date().toISOString(),
      };
    }

    // Write to KV (best-effort — failure here is non-fatal)
    if (redis) {
      try {
        await redis.set(kvKey(userId), JSON.stringify(data), {
          ex: KV_TTL_SECONDS,
        });
      } catch (e) {
        console.warn(
          `[kv] Failed to write subscription cache for user ${userId}:`,
          e,
        );
      }
    }

    return data;
  } catch (e) {
    // Polar API failed — try to return cached data from KV
    if (redis) {
      try {
        const cached = await getSubscriptionFromKV(userId);
        if (cached) {
          console.warn(
            `[kv] Polar API failed for user ${userId}, using cached data:`,
            e,
          );
          return cached;
        }
      } catch {
        // KV also failed, fall through
      }
    }

    console.error(
      `[kv] syncPolarDataToKV failed for user ${userId} (no cached fallback):`,
      e,
    );
    throw e;
  }
}

// ---------------------------------------------------------------------------
// getSubscriptionFromKV — read-only KV lookup.
// Returns null on miss, null redis, or any error.
// ---------------------------------------------------------------------------

export async function getSubscriptionFromKV(
  userId: string,
): Promise<PolarSubscriptionCache | null> {
  if (!redis) return null;

  try {
    const raw = await redis.get<string>(kvKey(userId));
    if (!raw) return null;

    // @upstash/redis may auto-parse JSON, handle both string and object
    const data =
      typeof raw === "string"
        ? (JSON.parse(raw) as PolarSubscriptionCache)
        : (raw as unknown as PolarSubscriptionCache);

    return data;
  } catch (e) {
    console.warn(
      `[kv] Failed to read subscription cache for user ${userId}:`,
      e,
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// applySubscriptionSideEffects — business logic that runs after a sync.
// Extracted from the old webhook handlers.
// ---------------------------------------------------------------------------

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export async function applySubscriptionSideEffects(
  db: DB,
  userId: string,
  data: PolarSubscriptionCache,
): Promise<void> {
  const isAdmin = await isAdminUser(db, userId);
  const config = getEffectivePlanConfig(data.planId, { isAdmin });

  // Clear the user's manual-refresh cooldown so they can immediately
  // refresh with their new plan's interval after upgrading.
  await db.update(user).set({ nextRefreshAt: null }).where(eq(user.id, userId));

  if (ACTIVE_STATUSES.has(data.status)) {
    // Subscription is active — stagger feed nextFetchAt across the refresh
    // interval so feeds don't all become due at the same instant.
    if (config.backgroundRefreshIntervalMs) {
      const activeFeeds = await db
        .select({ id: feeds.id })
        .from(feeds)
        .where(and(eq(feeds.userId, userId), eq(feeds.isActive, true)))
        .all();

      const interval = config.backgroundRefreshIntervalMs;
      const feedCount = activeFeeds.length;

      if (feedCount > 0) {
        const nowMs = Date.now();
        const cases = activeFeeds.map((f, i) => {
          const offset =
            feedCount > 1 ? Math.round((interval / feedCount) * i) : 0;
          const ts = Math.floor((nowMs + offset) / 1000);
          return sql`WHEN ${f.id} THEN ${ts}`;
        });

        await db
          .update(feeds)
          .set({
            nextFetchAt: sql`(CASE ${feeds.id} ${sql.join(cases, sql` `)} END)`,
          })
          .where(
            inArray(
              feeds.id,
              activeFeeds.map((f) => f.id),
            ),
          );
      }
    }
  } else {
    // Subscription ended — deactivate excess feeds, clear nextFetchAt
    await deactivateExcessFeeds(db, userId, PLANS.free.maxActiveFeeds);
    await db
      .update(feeds)
      .set({ nextFetchAt: null })
      .where(eq(feeds.userId, userId));
  }
}
