"use client";

import { CheckIcon, CircleHelpIcon, TreeDeciduousIcon } from "lucide-react";
import {
  QUOTA_DISPLAY_NAMES,
  RECOMMENDATION_MESSAGES,
  STANDARD_PLAN_IDS,
} from "./constants";
import { useSubscriptionDialogContext } from "./context";
import { BillingCycleSwitchButton } from "./BillingCycleSwitchButton";
import {
  formatDate,
  formatPrice,
  getPlanCardBorderClasses,
  getPlanFeatures,
} from "./utils";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { PLANS } from "~/server/subscriptions/plans";

export function StandardPlanCards() {
  const {
    planId,
    recommendedPlanId,
    chosenPlanId,
    isSubscribed,
    products,
    isLoadingProducts,
    pendingSwitch,
    currentBillingInterval,
    onBillingCycleSwitch,
    onSubscribeClick,
    checkoutMutation,
    previewMutation,
  } = useSubscriptionDialogContext();

  // Derive shared features from the first standard plan config (all standard
  // plans share the same refresh interval and background refresh capability).
  const sharedFeatures = getPlanFeatures(PLANS["standard-small"]).filter(
    (f) => !f.startsWith("Up to"),
  );

  return (
    <div className="border-border rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <TreeDeciduousIcon size={20} className="shrink-0" />
        <h3 className="font-medium">Standard</h3>
      </div>
      <ul className="mt-2 space-y-1">
        {sharedFeatures.map((feature) => (
          <li
            key={feature}
            className="text-muted-foreground flex items-center gap-2 text-sm"
          >
            <CheckIcon size={12} />
            {feature}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-col gap-4">
        {STANDARD_PLAN_IDS.map((id) => {
          const plan = PLANS[id];
          const isCurrent = id === planId;
          const isPending = pendingSwitch?.planId === id;
          const pendingDate = isPending ? pendingSwitch.appliesAt : null;
          const isRecommended = id === recommendedPlanId;
          const product = products?.find((p) => p.planId === id);
          const monthlyPrice = product?.monthlyPrice ?? null;
          const annualPrice = product?.annualPrice ?? null;
          const hasPrice = monthlyPrice != null || annualPrice != null;
          const feedsLabel = `Up to ${plan.maxActiveFeeds.toLocaleString()} active feeds`;

          return (
            <div
              key={id}
              className={`relative rounded-lg border p-3 ${getPlanCardBorderClasses(isCurrent, isRecommended)}`}
            >
              {(isCurrent || isPending || isRecommended) && (
                <div className="absolute -top-3 left-4 flex gap-1.5">
                  {isCurrent && (
                    <span className="bg-foreground text-background rounded-full px-3 py-0.5 text-xs font-medium">
                      Current
                    </span>
                  )}
                  {pendingDate && (
                    <span className="bg-background border-foreground/70 text-foreground rounded-full border border-dashed px-3 py-0.5 text-xs font-medium whitespace-nowrap">
                      Starting {formatDate(pendingDate)}
                    </span>
                  )}
                  {isRecommended && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="bg-background border-sidebar-accent text-sidebar-accent-foreground inline-flex cursor-default items-center gap-1 rounded-full border px-3 py-0.5 text-xs font-medium">
                          Recommended
                          <CircleHelpIcon size={12} />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-64">
                        {chosenPlanId === id
                          ? RECOMMENDATION_MESSAGES.currentPaid
                          : RECOMMENDATION_MESSAGES.upgrade}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="font-medium">{QUOTA_DISPLAY_NAMES[id]}</span>
                <div className="ml-auto flex items-center gap-3">
                  {isLoadingProducts ? (
                    <Skeleton className="h-4 w-20" />
                  ) : hasPrice ? (
                    <span className="text-muted-foreground text-base">
                      {monthlyPrice != null &&
                        `${formatPrice(monthlyPrice)}/mo`}
                      {monthlyPrice != null && annualPrice != null && " · "}
                      {annualPrice != null && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-default underline decoration-dotted underline-offset-4">
                              {formatPrice(annualPrice)}/yr
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {formatPrice(Math.round(annualPrice / 12))}
                            /mo
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </span>
                  ) : null}
                  {isCurrent && currentBillingInterval && (
                    <BillingCycleSwitchButton
                      currentInterval={currentBillingInterval}
                      onSwitch={onBillingCycleSwitch}
                      isPending={previewMutation.isPending}
                    />
                  )}
                  {!isCurrent && (
                    <Button
                      size="sm"
                      disabled={
                        checkoutMutation.isPending || previewMutation.isPending
                      }
                      onClick={() => onSubscribeClick(id)}
                    >
                      {isSubscribed ? "Switch" : "Subscribe"}
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-muted-foreground mt-1 text-sm">{feedsLabel}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
