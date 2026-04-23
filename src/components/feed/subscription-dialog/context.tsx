import { createContext, useContext } from "react";
import type { BillingInterval } from "./constants";
import type { PaidPlanId } from "~/server/subscriptions/plans";

export type SubscriptionDialogContextValue = {
  planId: string;
  recommendedPlanId: string | null;
  chosenPlanId: string;

  isSubscribed: boolean;
  products:
    | Array<{
        planId: string;
        monthlyPrice: number | null;
        annualPrice: number | null;
      }>
    | undefined;
  isLoadingProducts: boolean;
  pendingSwitch:
    | {
        planId: string;
        billingInterval: "month" | "year" | null;
        appliesAt: string;
      }
    | null
    | undefined;
  onSubscribeClick: (id: PaidPlanId) => void;
  onSwitchToFreeClick: () => void;
  isSwitchToFreeLoading: boolean;
  currentBillingInterval: BillingInterval | null;
  onBillingCycleSwitch: (interval: BillingInterval) => void;
  portalMutation: { isPending: boolean; mutate: (args: object) => void };
  checkoutMutation: { isPending: boolean };
  previewMutation: { isPending: boolean };
};

export const SubscriptionDialogContext =
  createContext<SubscriptionDialogContextValue | null>(null);

export function useSubscriptionDialogContext() {
  const ctx = useContext(SubscriptionDialogContext);
  if (!ctx) {
    throw new Error(
      "useSubscriptionDialogContext must be used within SubscriptionDialogProvider",
    );
  }
  return ctx;
}
