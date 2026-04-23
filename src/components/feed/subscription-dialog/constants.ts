import {
  ShrubIcon,
  SproutIcon,
  TreeDeciduousIcon,
  TreePineIcon,
  TreesIcon,
} from "lucide-react";

export const PLAN_ICONS = {
  free: SproutIcon,
  "standard-small": ShrubIcon,
  "standard-medium": TreeDeciduousIcon,
  "standard-large": TreePineIcon,
  pro: TreesIcon,
} as const;

export const QUOTA_DISPLAY_NAMES = {
  "standard-small": "Small",
  "standard-medium": "Medium",
  "standard-large": "Large",
} as const;

export const STANDARD_PLAN_IDS = [
  "standard-small",
  "standard-medium",
  "standard-large",
] as const;

export const RECOMMENDATION_MESSAGES = {
  currentFree:
    "You're just getting started with Serial, so no need to give us money just yet! Consider upgrading later when you have more feeds, or if you want feeds to refresh while you're away.",
  currentPaid:
    "This plan is just right for the number of feeds you have. Good choice!",
  upgrade:
    "We think this plan is right for you, as it will allow you to keep all your feeds active.",
} as const;

export type BillingInterval = "month" | "year";

export const INTERVAL_LABELS: Record<BillingInterval, string> = {
  month: "mo",
  year: "yr",
};

export const BILLING_INTERVAL_DISPLAY: Record<BillingInterval, string> = {
  month: "Monthly",
  year: "Annual",
};
