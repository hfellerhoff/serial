/**
 * Static copy of the main-instance plan lineup for the marketing pricing page.
 * Source of truth for enforcement lives in the app repo
 * (src/server/subscriptions/plans.ts) — keep the two in sync when plans change.
 */
export type PlanInfo = {
  name: string;
  maxActiveFeeds: number;
  features: string[];
};

export const FREE_PLAN: PlanInfo = {
  name: "Free",
  maxActiveFeeds: 40,
  features: [
    "Up to 40 active feeds",
    "Refresh up to once an hour",
    "Manual refresh only",
  ],
};

export const STANDARD_FEATURES = [
  "Refreshes once every 15 min",
  "Refresh in background",
];

export const STANDARD_PLANS = [
  { id: "standard-small", quotaName: "Small", maxActiveFeeds: 200 },
  { id: "standard-medium", quotaName: "Medium", maxActiveFeeds: 500 },
  { id: "standard-large", quotaName: "Large", maxActiveFeeds: 1000 },
] as const;

export const PRO_PLAN: PlanInfo = {
  name: "Pro",
  maxActiveFeeds: 2500,
  features: [
    "Up to 2,500 active feeds",
    "Refreshes every minute",
    "Refresh in background",
  ],
};

export const PLAN_PRICES = {
  "standard-small": { monthly: 2, annual: 20 },
  "standard-medium": { monthly: 4, annual: 40 },
  "standard-large": { monthly: 6, annual: 60 },
  pro: { monthly: 12, annual: 120 },
} as const;

export function getMonthlyFromAnnual(annual: number): string {
  const monthly = annual / 12;
  const withCents = monthly.toFixed(2);
  return withCents.endsWith(".00") ? withCents.slice(0, -3) : withCents;
}
