import { z } from "zod";
import { eq } from "drizzle-orm";
import type { PaidPlanId } from "~/server/subscriptions/plans";
import { protectedProcedure } from "~/server/orpc/base";
import {
  getUserPlanId,
  getUserPlanLimits,
} from "~/server/subscriptions/helpers";
import {
  determinePlanFromProductId,
  getAllKnownProductIds,
  getPolarProductIds,
  IS_BILLING_ENABLED,
  polarClient,
} from "~/server/subscriptions/polar";
import { PAID_PLAN_IDS, PLAN_IDS, PLANS } from "~/server/subscriptions/plans";
import {
  applySubscriptionSideEffects,
  getSubscriptionFromKV,
  redis,
  syncPolarDataToKV,
} from "~/server/subscriptions/kv";
import { user } from "~/server/db/schema";
import { IS_EMAIL_ENABLED } from "~/server/email";
import { captureException } from "~/server/logger";

const BASE_URL = process.env.BETTER_AUTH_BASE_URL ?? "http://localhost:3000";

function getValidatedOrigin(headers: Headers): string {
  const origin = headers.get("origin") ?? headers.get("referer");
  if (origin) {
    try {
      const parsed = new URL(origin);
      const base = new URL(BASE_URL);
      if (parsed.origin === base.origin) {
        return base.origin;
      }
    } catch {
      // invalid URL, fall through
    }
  }
  return BASE_URL;
}

type CachedProducts = {
  data: PlanProduct[];
  expiresAt: number;
};

type PlanProduct = {
  planId: PaidPlanId;
  planName: string;
  monthlyPrice: number | null;
  annualPrice: number | null;
  monthlyProductId: string | null;
  annualProductId: string | null;
};

let productsCache: CachedProducts | null = null;
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

/** Cooldown window for syncAfterCheckout per user (seconds). */
const SYNC_COOLDOWN_SECONDS = 30;

export const getStatus = protectedProcedure.handler(async ({ context }) => {
  return getUserPlanLimits(context.db, context.user.id);
});

/** Force-refresh the plan from Polar, bypassing the KV cache. */
export const refreshStatus = protectedProcedure.handler(async ({ context }) => {
  if (IS_BILLING_ENABLED) {
    try {
      await syncPolarDataToKV(context.user.id);
    } catch (e) {
      captureException(e);
      console.warn(
        `[subscription] refreshStatus sync failed for user ${context.user.id}:`,
        e,
      );
    }
  }
  return getUserPlanLimits(context.db, context.user.id);
});

export const getProducts = protectedProcedure.handler(async () => {
  if (!IS_BILLING_ENABLED || !polarClient) {
    return [];
  }

  // Check cache
  if (productsCache && Date.now() < productsCache.expiresAt) {
    return productsCache.data;
  }

  const productIds = PAID_PLAN_IDS.flatMap((planId) => {
    const ids = getPolarProductIds(planId);
    return [ids.monthly, ids.annual];
  }).filter(Boolean);

  if (productIds.length === 0) {
    return [];
  }

  try {
    const results: PlanProduct[] = [];

    for (const planId of PAID_PLAN_IDS) {
      const plan = PLANS[planId];
      const planProductIds = getPolarProductIds(planId);

      // Skip plans that have no Polar product IDs configured
      if (!planProductIds.monthly && !planProductIds.annual) continue;

      let monthlyPrice: number | null = null;
      let annualPrice: number | null = null;

      if (planProductIds.monthly) {
        try {
          const product = await polarClient.products.get({
            id: planProductIds.monthly,
          });
          const price = product.prices?.[0];
          if (price && "amountType" in price && price.amountType === "fixed") {
            monthlyPrice = (price as { priceAmount: number }).priceAmount;
          }
        } catch (e) {
          captureException(e);
        }
      }

      if (planProductIds.annual) {
        try {
          const product = await polarClient.products.get({
            id: planProductIds.annual,
          });
          const price = product.prices?.[0];
          if (price && "amountType" in price && price.amountType === "fixed") {
            annualPrice = (price as { priceAmount: number }).priceAmount;
          }
        } catch (e) {
          captureException(e);
          console.error(
            `[subscription] Failed to fetch annual product for ${planId}:`,
            e,
          );
        }
      }

      results.push({
        planId,
        planName: plan.name,
        monthlyPrice,
        annualPrice,
        monthlyProductId: planProductIds.monthly,
        annualProductId: planProductIds.annual,
      });
    }

    productsCache = {
      data: results,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };

    return results;
  } catch (e) {
    captureException(e);
    console.error("[subscription] Failed to fetch products:", e);
    return [];
  }
});

export const createCheckout = protectedProcedure
  .input(
    z.object({
      planId: z.enum(PAID_PLAN_IDS),
      returnPath: z.string().optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    if (!IS_BILLING_ENABLED || !polarClient) {
      return { url: null, error: "billing-disabled" as const };
    }

    // Prevent double-checkout: block if user already has an active paid plan
    const existingPlan = await getUserPlanId(context.user.id);
    if (existingPlan !== "free") {
      return { url: null, error: "already-subscribed" as const };
    }

    if (IS_EMAIL_ENABLED) {
      const currentUser = await context.db
        .select({ emailVerified: user.emailVerified })
        .from(user)
        .where(eq(user.id, context.user.id))
        .get();

      if (!currentUser?.emailVerified) {
        return { url: null, error: "email-not-verified" as const };
      }
    }

    const planProductIds = getPolarProductIds(input.planId);
    const productIds = [planProductIds.monthly, planProductIds.annual].filter(
      (id): id is string => id != null,
    );

    if (productIds.length === 0) {
      return { url: null, error: "no-products" as const };
    }

    const origin = getValidatedOrigin(context.headers);
    // Validate returnPath: resolve against origin and verify it stays on the same host.
    // This prevents open-redirect via protocol-relative paths (//evil.com) or traversal (/../).
    let safePath = "/";
    if (input.returnPath) {
      try {
        const resolved = new URL(input.returnPath, origin);
        if (resolved.origin === origin) {
          safePath = resolved.pathname;
        }
      } catch {
        // Malformed path, fall back to "/"
      }
    }
    const checkout = await polarClient.checkouts.create({
      externalCustomerId: context.user.id,
      customerEmail: context.user.email,
      products: productIds,
      successUrl: `${origin}${safePath}?checkout_success=true`,
      returnUrl: `${origin}${safePath}`,
    });

    return { url: checkout.url, error: null };
  });

export const previewPlanSwitch = protectedProcedure
  .input(
    z.object({
      planId: z.enum(PAID_PLAN_IDS),
      billingInterval: z.enum(["month", "year"]).optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    if (!IS_BILLING_ENABLED || !polarClient) {
      return null;
    }

    // Find current active subscription
    const subscriptions = await polarClient.subscriptions.list({
      externalCustomerId: [context.user.id],
      active: true,
    });

    const currentSub = subscriptions.result?.items?.[0];
    if (!currentSub) return null;

    const currentPlanId = determinePlanFromProductId(currentSub.productId);
    if (!currentPlanId) return null;

    // Block if same plan AND same (or unspecified) billing interval
    const isSamePlan = currentPlanId === input.planId;
    const isSameInterval =
      !input.billingInterval ||
      input.billingInterval === currentSub.recurringInterval;
    if (isSamePlan && isSameInterval) return null;

    const newPlan = PLANS[input.planId];
    const newPlanProductIds = getPolarProductIds(input.planId);
    const interval = input.billingInterval ?? currentSub.recurringInterval;
    const isMonthly = interval === "month";
    const newProductId = isMonthly
      ? newPlanProductIds.monthly
      : newPlanProductIds.annual;

    if (!newProductId) return null;

    // Get the new product price
    let newAmount: number | null = null;
    try {
      const product = await polarClient.products.get({ id: newProductId });
      const price = product.prices?.[0];
      if (price && "amountType" in price && price.amountType === "fixed") {
        newAmount = (price as { priceAmount: number }).priceAmount;
      }
    } catch {
      return null;
    }

    // Determine upgrade vs downgrade by plan tier order.
    // Same-plan annual→monthly is also treated as a downgrade (deferred switch).
    const currentPlanIndex = PLAN_IDS.indexOf(currentPlanId);
    const newPlanIndex = PLAN_IDS.indexOf(input.planId);
    const isSamePlanAnnualToMonthly =
      currentPlanId === input.planId &&
      currentSub.recurringInterval === "year" &&
      interval === "month";
    const isDowngrade =
      newPlanIndex < currentPlanIndex || isSamePlanAnnualToMonthly;

    // Calculate proration (only meaningful for upgrades)
    let proratedAmount = 0;
    if (!isDowngrade) {
      const now = Date.now();
      const periodStart = new Date(currentSub.currentPeriodStart).getTime();
      const periodEnd = new Date(currentSub.currentPeriodEnd).getTime();
      const totalPeriod = periodEnd - periodStart;
      const elapsed = now - periodStart;
      const remaining = Math.max(0, 1 - elapsed / totalPeriod);

      const currentCredit = Math.round(currentSub.amount * remaining);
      const newCharge = Math.round((newAmount ?? 0) * remaining);
      proratedAmount = Math.max(0, newCharge - currentCredit);
    }

    return {
      currentPlanId,
      currentPlanName: PLANS[currentPlanId].name,
      currentAmount: currentSub.amount,
      newPlanId: input.planId,
      newPlanName: newPlan.name,
      newAmount: newAmount ?? 0,
      proratedAmount,
      isDowngrade,
      periodEnd: new Date(currentSub.currentPeriodEnd).toISOString(),
      currency: currentSub.currency,
      billingInterval: interval as "month" | "year",
      subscriptionId: currentSub.id,
      newProductId,
    };
  });

export const switchPlan = protectedProcedure
  .input(
    z.object({
      subscriptionId: z.string(),
      newProductId: z.string(),
    }),
  )
  .handler(async ({ context, input }) => {
    if (!IS_BILLING_ENABLED || !polarClient) {
      return { success: false as const, error: "billing-disabled" as const };
    }

    // Verify the new product ID belongs to a known plan
    const knownProductIds = getAllKnownProductIds();
    if (!knownProductIds.has(input.newProductId)) {
      return { success: false as const, error: "invalid-product" as const };
    }

    // Verify the subscription belongs to this user
    const subscriptions = await polarClient.subscriptions.list({
      externalCustomerId: [context.user.id],
      active: true,
    });

    const sub = subscriptions.result?.items?.find(
      (s) => s.id === input.subscriptionId,
    );
    if (!sub) {
      return {
        success: false as const,
        error: "subscription-not-found" as const,
      };
    }

    // Determine upgrade vs downgrade to choose proration strategy:
    // - Upgrades: "invoice" — charge the prorated difference immediately
    // - Downgrades: "next_period" — defer the switch to the next billing cycle
    // Same-plan annual→monthly is also treated as a downgrade (deferred switch).
    const currentPlanId = determinePlanFromProductId(sub.productId);
    const newPlanId = determinePlanFromProductId(input.newProductId);
    const currentIndex = currentPlanId ? PLAN_IDS.indexOf(currentPlanId) : -1;
    const newIndex = newPlanId ? PLAN_IDS.indexOf(newPlanId) : -1;
    const newPlanProductIds = newPlanId ? getPolarProductIds(newPlanId) : null;
    const isNewMonthly = newPlanProductIds?.monthly === input.newProductId;
    const isSamePlanAnnualToMonthly =
      currentPlanId === newPlanId &&
      sub.recurringInterval === "year" &&
      isNewMonthly;
    const isDowngrade = newIndex < currentIndex || isSamePlanAnnualToMonthly;

    await polarClient.subscriptions.update({
      id: input.subscriptionId,
      subscriptionUpdate: {
        productId: input.newProductId,
        prorationBehavior: isDowngrade ? "next_period" : "invoice",
      },
    });

    console.log(
      `[polar] Plan switched for user=${context.user.id} subscription=${input.subscriptionId} newProduct=${input.newProductId}`,
    );

    // Immediately update KV cache with the new plan
    try {
      await syncPolarDataToKV(context.user.id);
    } catch (e) {
      captureException(e);
      console.warn(
        `[polar] Post-switch sync failed for user=${context.user.id}:`,
        e,
      );
    }

    return { success: true as const, error: null };
  });

/**
 * Eagerly sync subscription state after checkout completes.
 * Called once from the client on checkout success — replaces the old polling approach.
 * Rate-limited per user via KV to prevent abuse.
 */
export const syncAfterCheckout = protectedProcedure.handler(
  async ({ context }) => {
    if (!IS_BILLING_ENABLED) {
      return getUserPlanLimits(context.db, context.user.id);
    }

    // Per-user rate limit: one sync per SYNC_COOLDOWN_SECONDS
    const lockKey = `sync-checkout-lock:${context.user.id}`;
    if (redis) {
      const acquired = await redis.set(lockKey, "1", {
        nx: true,
        ex: SYNC_COOLDOWN_SECONDS,
      });
      if (!acquired) {
        // Cooldown active — return current state without re-syncing
        return getUserPlanLimits(context.db, context.user.id);
      }
    }

    try {
      const data = await syncPolarDataToKV(context.user.id);
      await applySubscriptionSideEffects(context.db, context.user.id, data);
    } catch (e) {
      captureException(e);
      console.warn(
        `[subscription] syncAfterCheckout failed for user ${context.user.id}:`,
        e,
      );
    }

    return getUserPlanLimits(context.db, context.user.id);
  },
);

export const getPendingSwitch = protectedProcedure.handler(
  async ({ context }) => {
    if (!IS_BILLING_ENABLED || !polarClient) return null;

    const subscriptions = await polarClient.subscriptions.list({
      externalCustomerId: [context.user.id],
      active: true,
    });

    const sub = subscriptions.result?.items?.[0];
    if (!sub) return null;

    // Subscription set to cancel at period end → user reverts to free
    if (sub.cancelAtPeriodEnd && sub.currentPeriodEnd) {
      return {
        planId: "free" as const,
        billingInterval: null as "month" | "year" | null,
        appliesAt: new Date(sub.currentPeriodEnd).toISOString(),
      };
    }

    if (!sub.pendingUpdate?.productId) return null;

    const pendingPlanId = determinePlanFromProductId(
      sub.pendingUpdate.productId,
    );
    if (!pendingPlanId) return null;

    // Determine billing interval of the pending product
    const pendingPlanProductIds = getPolarProductIds(pendingPlanId);
    const pendingBillingInterval: "month" | "year" =
      pendingPlanProductIds.monthly === sub.pendingUpdate.productId
        ? "month"
        : "year";

    return {
      planId: pendingPlanId,
      billingInterval: pendingBillingInterval as "month" | "year" | null,
      appliesAt: new Date(sub.pendingUpdate.appliesAt).toISOString(),
    };
  },
);

export const revertPendingChange = protectedProcedure.handler(
  async ({ context }) => {
    if (!IS_BILLING_ENABLED || !polarClient) {
      return { success: false as const, error: "billing-disabled" as const };
    }

    const subscriptions = await polarClient.subscriptions.list({
      externalCustomerId: [context.user.id],
      active: true,
    });

    const sub = subscriptions.result?.items?.[0];
    if (!sub) {
      return { success: false as const, error: "no-subscription" as const };
    }

    if (sub.cancelAtPeriodEnd) {
      // Undo scheduled cancellation — reactivate
      await polarClient.subscriptions.update({
        id: sub.id,
        subscriptionUpdate: {
          cancelAtPeriodEnd: false,
        },
      });
    } else if (sub.pendingUpdate?.productId) {
      // Undo pending product switch — revert to current product
      await polarClient.subscriptions.update({
        id: sub.id,
        subscriptionUpdate: {
          productId: sub.productId,
        },
      });
    } else {
      return { success: false as const, error: "no-pending-change" as const };
    }

    console.log(
      `[polar] Pending change reverted for user=${context.user.id} subscription=${sub.id}`,
    );

    try {
      await syncPolarDataToKV(context.user.id);
    } catch (e) {
      captureException(e);
      console.warn(
        `[polar] Post-revert sync failed for user=${context.user.id}:`,
        e,
      );
    }

    return { success: true as const, error: null };
  },
);

export const previewDowngrade = protectedProcedure.handler(
  async ({ context }) => {
    if (!IS_BILLING_ENABLED || !polarClient) return null;

    const subscriptions = await polarClient.subscriptions.list({
      externalCustomerId: [context.user.id],
      active: true,
    });

    const sub = subscriptions.result?.items?.[0];
    if (!sub) return null;

    const currentPlanId = determinePlanFromProductId(sub.productId);
    if (!currentPlanId || currentPlanId === "free") return null;

    return {
      currentPlanId,
      currentPlanName: PLANS[currentPlanId].name,
      periodEnd: new Date(sub.currentPeriodEnd).toISOString(),
      subscriptionId: sub.id,
    };
  },
);

export const cancelSubscription = protectedProcedure.handler(
  async ({ context }) => {
    if (!IS_BILLING_ENABLED || !polarClient) {
      return { success: false as const, error: "billing-disabled" as const };
    }

    const subscriptions = await polarClient.subscriptions.list({
      externalCustomerId: [context.user.id],
      active: true,
    });

    const sub = subscriptions.result?.items?.[0];
    if (!sub) {
      return { success: false as const, error: "no-subscription" as const };
    }

    await polarClient.subscriptions.update({
      id: sub.id,
      subscriptionUpdate: {
        cancelAtPeriodEnd: true,
      },
    });

    console.log(
      `[polar] Subscription cancelled at period end for user=${context.user.id} subscription=${sub.id}`,
    );

    try {
      await syncPolarDataToKV(context.user.id);
    } catch (e) {
      captureException(e);
      console.warn(
        `[polar] Post-cancel sync failed for user=${context.user.id}:`,
        e,
      );
    }

    return { success: true as const, error: null };
  },
);

export const createPortalSession = protectedProcedure.handler(
  async ({ context }) => {
    if (!IS_BILLING_ENABLED || !polarClient) {
      return { url: null };
    }

    const origin = getValidatedOrigin(context.headers);
    const session = await polarClient.customerSessions.create({
      externalCustomerId: context.user.id,
      returnUrl: `${origin}/?subscription=open`,
    });

    return { url: session.customerPortalUrl };
  },
);

export const getSubscriptionSummary = protectedProcedure.handler(
  async ({ context }) => {
    if (!IS_BILLING_ENABLED) return null;

    let cached = await getSubscriptionFromKV(context.user.id);

    if (!cached) {
      try {
        cached = await syncPolarDataToKV(context.user.id);
      } catch {
        return null;
      }
    }

    if (cached.planId === "free" || cached.status === "none") return null;

    const plan = PLANS[cached.planId];
    return {
      planId: cached.planId,
      planName: plan.name,
      amount: cached.amount,
      currency: cached.currency,
      billingInterval: cached.recurringInterval as "month" | "year" | null,
      currentPeriodEnd: cached.currentPeriodEnd,
    };
  },
);
