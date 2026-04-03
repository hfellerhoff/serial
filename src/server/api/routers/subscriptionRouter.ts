import { z } from "zod";
import { eq } from "drizzle-orm";
import type { PlanId } from "~/server/subscriptions/plans";
import { protectedProcedure } from "~/server/orpc/base";
import { getUserPlanLimits } from "~/server/subscriptions/helpers";
import { IS_BILLING_ENABLED, polarClient } from "~/server/subscriptions/polar";
import { PLANS } from "~/server/subscriptions/plans";
import { user } from "~/server/db/schema";

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
  planId: PlanId;
  planName: string;
  monthlyPrice: number | null;
  annualPrice: number | null;
  monthlyProductId: string | null;
  annualProductId: string | null;
};

let productsCache: CachedProducts | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export const getStatus = protectedProcedure.handler(async ({ context }) => {
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

  const productIds = [
    PLANS.standard.polarMonthlyProductId,
    PLANS.standard.polarAnnualProductId,
    PLANS.pro.polarMonthlyProductId,
    PLANS.pro.polarAnnualProductId,
  ].filter(Boolean);

  if (productIds.length === 0) {
    return [];
  }

  try {
    const results: PlanProduct[] = [];

    for (const planId of ["standard", "pro"] as const) {
      const plan = PLANS[planId];
      let monthlyPrice: number | null = null;
      let annualPrice: number | null = null;

      if (plan.polarMonthlyProductId) {
        try {
          const product = await polarClient.products.get({
            id: plan.polarMonthlyProductId,
          });
          const price = product.prices?.[0];
          if (price && "amountType" in price && price.amountType === "fixed") {
            monthlyPrice = (price as { priceAmount: number }).priceAmount;
          }
        } catch {
          // Skip if product not found
        }
      }

      if (plan.polarAnnualProductId) {
        try {
          const product = await polarClient.products.get({
            id: plan.polarAnnualProductId,
          });
          const price = product.prices?.[0];
          if (price && "amountType" in price && price.amountType === "fixed") {
            annualPrice = (price as { priceAmount: number }).priceAmount;
          }
        } catch (e) {
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
        monthlyProductId: plan.polarMonthlyProductId,
        annualProductId: plan.polarAnnualProductId,
      });
    }

    productsCache = {
      data: results,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };

    return results;
  } catch (e) {
    console.error("[subscription] Failed to fetch products:", e);
    return [];
  }
});

export const createCheckout = protectedProcedure
  .input(z.object({ planId: z.enum(["standard", "pro"]) }))
  .handler(async ({ context, input }) => {
    if (!IS_BILLING_ENABLED || !polarClient) {
      return { url: null, error: null };
    }

    if (process.env.SENDGRID_API_KEY) {
      const currentUser = await context.db
        .select({ emailVerified: user.emailVerified })
        .from(user)
        .where(eq(user.id, context.user.id))
        .get();

      if (!currentUser?.emailVerified) {
        return { url: null, error: "email-not-verified" as const };
      }
    }

    const plan = PLANS[input.planId];
    const productIds = [
      plan.polarMonthlyProductId,
      plan.polarAnnualProductId,
    ].filter((id): id is string => id != null);

    if (productIds.length === 0) {
      return { url: null, error: null };
    }

    const origin = getValidatedOrigin(context.headers);
    const checkout = await polarClient.checkouts.create({
      externalCustomerId: context.user.id,
      customerEmail: context.user.email,
      products: productIds,
      successUrl: `${origin}/?checkout_success=true`,
      returnUrl: `${origin}/`,
    });

    return { url: checkout.url, error: null };
  });

export const createPortalSession = protectedProcedure.handler(
  async ({ context }) => {
    if (!IS_BILLING_ENABLED || !polarClient) {
      return { url: null };
    }

    const origin = getValidatedOrigin(context.headers);
    const session = await polarClient.customerSessions.create({
      externalCustomerId: context.user.id,
      returnUrl: `${origin}/`,
    });

    return { url: session.customerPortalUrl };
  },
);
