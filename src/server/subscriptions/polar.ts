import { Polar } from "@polar-sh/sdk";
import type { PlanId } from "./plans";
import { IS_MAIN_INSTANCE } from "~/lib/constants";
import { env } from "~/env";

function hasAllPolarCredentials(): boolean {
  return !!(
    env.POLAR_ACCESS_TOKEN &&
    env.POLAR_WEBHOOK_SECRET &&
    env.POLAR_STANDARD_SMALL_QUOTA_MONTHLY_PRODUCT_ID &&
    env.POLAR_STANDARD_SMALL_QUOTA_ANNUAL_PRODUCT_ID &&
    env.POLAR_STANDARD_MEDIUM_QUOTA_MONTHLY_PRODUCT_ID &&
    env.POLAR_STANDARD_MEDIUM_QUOTA_ANNUAL_PRODUCT_ID &&
    env.POLAR_STANDARD_LARGE_QUOTA_MONTHLY_PRODUCT_ID &&
    env.POLAR_STANDARD_LARGE_QUOTA_ANNUAL_PRODUCT_ID &&
    env.POLAR_PRO_MONTHLY_PRODUCT_ID &&
    env.POLAR_PRO_ANNUAL_PRODUCT_ID
  );
}

function createPolarClient(): Polar | null {
  if (!IS_MAIN_INSTANCE || !hasAllPolarCredentials()) return null;

  if (!env.POLAR_ENVIRONMENT) {
    throw new Error(
      "POLAR_ENVIRONMENT must be set to 'production' or 'sandbox' when billing is enabled.",
    );
  }

  return new Polar({
    accessToken: env.POLAR_ACCESS_TOKEN!,
    server: env.POLAR_ENVIRONMENT,
  });
}

export const polarClient = createPolarClient();

/** True only when running as the main instance with all Polar credentials configured. */
export const IS_BILLING_ENABLED = polarClient !== null;

// ---------------------------------------------------------------------------
// Product ID map — keyed by plan ID, contains monthly/annual Polar product IDs.
// Server-only: populated from typed env vars.
// ---------------------------------------------------------------------------

const PLAN_PRODUCT_IDS: Record<
  Exclude<PlanId, "free">,
  { monthly: string | null; annual: string | null }
> = {
  "standard-small": {
    monthly: env.POLAR_STANDARD_SMALL_QUOTA_MONTHLY_PRODUCT_ID ?? null,
    annual: env.POLAR_STANDARD_SMALL_QUOTA_ANNUAL_PRODUCT_ID ?? null,
  },
  "standard-medium": {
    monthly: env.POLAR_STANDARD_MEDIUM_QUOTA_MONTHLY_PRODUCT_ID ?? null,
    annual: env.POLAR_STANDARD_MEDIUM_QUOTA_ANNUAL_PRODUCT_ID ?? null,
  },
  "standard-large": {
    monthly: env.POLAR_STANDARD_LARGE_QUOTA_MONTHLY_PRODUCT_ID ?? null,
    annual: env.POLAR_STANDARD_LARGE_QUOTA_ANNUAL_PRODUCT_ID ?? null,
  },
  pro: {
    monthly: env.POLAR_PRO_MONTHLY_PRODUCT_ID ?? null,
    annual: env.POLAR_PRO_ANNUAL_PRODUCT_ID ?? null,
  },
};

/** Returns the Polar product IDs for a given plan (monthly and annual). */
export function getPolarProductIds(planId: PlanId): {
  monthly: string | null;
  annual: string | null;
} {
  if (planId === "free") return { monthly: null, annual: null };
  return PLAN_PRODUCT_IDS[planId];
}

/** Returns the plan ID for a given Polar product ID, or null if not found. */
export function determinePlanFromProductId(productId: string): PlanId | null {
  for (const [planId, ids] of Object.entries(PLAN_PRODUCT_IDS)) {
    if (ids.monthly === productId || ids.annual === productId) {
      return planId as PlanId;
    }
  }
  return null;
}

/** Returns the set of all configured Polar product IDs across every plan. */
export function getAllKnownProductIds(): Set<string> {
  const ids = new Set<string>();
  for (const planIds of Object.values(PLAN_PRODUCT_IDS)) {
    if (planIds.monthly) ids.add(planIds.monthly);
    if (planIds.annual) ids.add(planIds.annual);
  }
  return ids;
}
