import { getPolarProductIds, IS_BILLING_ENABLED, polarClient } from "./polar";
import { PAID_PLAN_IDS, PLANS } from "./plans";
import type { PaidPlanId } from "./plans";
import { captureException } from "~/server/logger";

export type PlanProduct = {
  planId: PaidPlanId;
  planName: string;
  monthlyPrice: number | null;
  annualPrice: number | null;
  monthlyProductId: string | null;
  annualProductId: string | null;
};

type CachedProducts = {
  data: PlanProduct[];
  expiresAt: number;
};

let productsCache: CachedProducts | null = null;
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

export async function fetchProducts(): Promise<PlanProduct[]> {
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
            `[subscription] Failed to fetch annual product for ${planId}:\n`,
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
}
