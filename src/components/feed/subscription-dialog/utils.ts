import type { PlanConfig } from "~/server/subscriptions/plans";
import { PLAN_IDS, PLANS } from "~/server/subscriptions/plans";

export function formatPrice(cents: number): string {
  const dollars = cents / 100;
  return cents % 100 === 0 ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatRefreshInterval(ms: number): string {
  const minutes = Math.round(ms / (60 * 1000));
  if (minutes < 60) {
    return minutes === 1
      ? "Refreshes every minute"
      : `Refreshes once every ${minutes} min`;
  }
  const hours = Math.round(minutes / 60);
  return hours === 1
    ? "Refresh up to once an hour"
    : `Refresh up to once every ${hours} hours`;
}

export function getPlanFeatures(plan: PlanConfig): string[] {
  const features: string[] = [];

  if (plan.maxActiveFeeds === Infinity) {
    features.push("Unlimited active feeds");
  } else {
    features.push(`Up to ${plan.maxActiveFeeds.toLocaleString()} active feeds`);
  }

  features.push(formatRefreshInterval(plan.refreshIntervalMs));

  if (plan.backgroundRefreshIntervalMs != null) {
    features.push("Refresh in background");
  } else {
    features.push("Manual refresh only");
  }

  return features;
}

export function getRecommendedPlanId(
  totalFeeds: number,
  currentPlanIndex: number,
): string | null {
  const bestFit = PLAN_IDS.find((id) => PLANS[id].maxActiveFeeds >= totalFeeds);
  if (!bestFit) return null;
  const bestFitIndex = PLAN_IDS.indexOf(bestFit);
  if (bestFitIndex < currentPlanIndex) return null;
  return bestFit;
}

export function getPlanCardBorderClasses(
  isCurrent: boolean,
  isRecommended: boolean,
): string {
  if (isCurrent || isRecommended) {
    return isCurrent && !isRecommended
      ? "border-foreground bg-foreground/5"
      : "border-sidebar-accent bg-sidebar-accent/5";
  }
  return "border-border";
}
