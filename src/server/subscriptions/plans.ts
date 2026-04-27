import { IS_MAIN_INSTANCE } from "~/lib/constants";

export const PLAN_IDS = [
  "free",
  "standard-small",
  "standard-medium",
  "standard-large",
  "pro",
] as const;
export type PlanId = (typeof PLAN_IDS)[number];
export type PaidPlanId = Exclude<PlanId, "free">;

export const PAID_PLAN_IDS = [
  "standard-small",
  "standard-medium",
  "standard-large",
  "pro",
] as const satisfies readonly PaidPlanId[];

export type PlanConfig = {
  id: PlanId;
  name: string;
  maxActiveFeeds: number;
  /** Minimum interval between user-initiated refreshes (server-enforced). */
  refreshIntervalMs: number;
  backgroundRefreshIntervalMs: number | null;
};

/**
 * Small buffer subtracted from refresh intervals so users don't hit the
 * rate-limit boundary when refreshing right on the dot (e.g. every 15 min).
 */
const REFRESH_PERIOD_BUFFER = 59_000;

const STANDARD_BACKGROUND_REFRESH_MS = 15 * 60 * 1000; // ~15 minutes
const STANDARD_REFRESH_MS =
  STANDARD_BACKGROUND_REFRESH_MS - REFRESH_PERIOD_BUFFER;

const PRO_BACKGROUND_REFRESH_MS = 1 * 60 * 1000; // 1 minute
const PRO_REFRESH_MS = PRO_BACKGROUND_REFRESH_MS - REFRESH_PERIOD_BUFFER;

export const PLANS: Record<PlanId, PlanConfig> = {
  free: {
    id: "free",
    name: "Free",
    maxActiveFeeds: 40,
    refreshIntervalMs: 60 * 60 * 1000, // 1 hour
    backgroundRefreshIntervalMs: null,
  },
  "standard-small": {
    id: "standard-small",
    name: "Small",
    maxActiveFeeds: 200,
    refreshIntervalMs: STANDARD_REFRESH_MS,
    backgroundRefreshIntervalMs: STANDARD_BACKGROUND_REFRESH_MS,
  },
  "standard-medium": {
    id: "standard-medium",
    name: "Medium",
    maxActiveFeeds: 500,
    refreshIntervalMs: STANDARD_REFRESH_MS,
    backgroundRefreshIntervalMs: STANDARD_BACKGROUND_REFRESH_MS,
  },
  "standard-large": {
    id: "standard-large",
    name: "Large",
    maxActiveFeeds: 1000,
    refreshIntervalMs: STANDARD_REFRESH_MS,
    backgroundRefreshIntervalMs: STANDARD_BACKGROUND_REFRESH_MS,
  },
  pro: {
    id: "pro",
    name: "Pro",
    maxActiveFeeds: 2500,
    refreshIntervalMs: PRO_REFRESH_MS,
    backgroundRefreshIntervalMs: PRO_BACKGROUND_REFRESH_MS,
  },
};

const UNLIMITED_CONFIG: PlanConfig = {
  id: "pro",
  name: "Pro",
  maxActiveFeeds: Infinity,
  refreshIntervalMs: PRO_REFRESH_MS,
  backgroundRefreshIntervalMs: PRO_BACKGROUND_REFRESH_MS,
};

export function getEffectivePlanConfig(
  planId: PlanId,
  options?: { isAdmin?: boolean },
): PlanConfig {
  if (!IS_MAIN_INSTANCE || options?.isAdmin) return UNLIMITED_CONFIG;
  return PLANS[planId];
}
