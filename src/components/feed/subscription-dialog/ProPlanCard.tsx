"use client";

import { CheckIcon, CircleHelpIcon } from "lucide-react";
import { PLAN_ICONS, RECOMMENDATION_MESSAGES } from "./constants";
import { useSubscriptionDialogContext } from "./context";
import { BillingCycleSwitchButton } from "./BillingCycleSwitchButton";
import {
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

export function ProPlanCard() {
  const {
    planId,
    recommendedPlanId,
    chosenPlanId,
    products,
    isLoadingProducts,
    isSubscribed,
    currentBillingInterval,
    onBillingCycleSwitch,
    onSubscribeClick,
    checkoutMutation,
    previewMutation,
  } = useSubscriptionDialogContext();
  const plan = PLANS.pro;
  const isCurrent = planId === "pro";
  const isRecommended = recommendedPlanId === "pro";
  const features = getPlanFeatures(plan);
  const Icon = PLAN_ICONS.pro;
  const product = products?.find((p) => p.planId === "pro");
  const monthlyPrice = product?.monthlyPrice ?? null;
  const annualPrice = product?.annualPrice ?? null;
  const hasPrice = monthlyPrice != null || annualPrice != null;

  const showBillingCycleSwitch = isCurrent && currentBillingInterval != null;

  return (
    <div
      className={`relative flex flex-col rounded-lg border p-4 ${getPlanCardBorderClasses(isCurrent, isRecommended)}`}
    >
      {(isCurrent || isRecommended) && (
        <div className="absolute -top-3 left-1/2 flex -translate-x-1/2 gap-1.5">
          {isCurrent && (
            <span className="bg-foreground text-background rounded-full px-3 py-0.5 text-xs font-medium">
              Current
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
                {chosenPlanId === "pro"
                  ? RECOMMENDATION_MESSAGES.currentPaid
                  : RECOMMENDATION_MESSAGES.upgrade}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon size={20} className="shrink-0" />
          <h3 className="font-medium">{plan.name}</h3>
        </div>
        {isLoadingProducts ? (
          <Skeleton className="h-4 w-28" />
        ) : hasPrice ? (
          <p className="text-muted-foreground text-base">
            {monthlyPrice != null && `${formatPrice(monthlyPrice)}/mo`}
            {monthlyPrice != null && annualPrice != null && " · "}
            {annualPrice != null && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-default underline decoration-dotted underline-offset-4">
                    {formatPrice(annualPrice)}/yr
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {formatPrice(Math.round(annualPrice / 12))}/mo
                </TooltipContent>
              </Tooltip>
            )}
          </p>
        ) : null}
      </div>
      <ul className="mt-2 space-y-1">
        {features.map((feature) => (
          <li
            key={feature}
            className="text-muted-foreground flex items-center gap-2 text-sm"
          >
            <CheckIcon size={12} />
            {feature}
          </li>
        ))}
      </ul>
      {showBillingCycleSwitch && (
        <div className="mt-auto pt-3">
          <BillingCycleSwitchButton
            currentInterval={currentBillingInterval}
            onSwitch={onBillingCycleSwitch}
            isPending={previewMutation.isPending}
          />
        </div>
      )}
      {!isCurrent && (
        <div className="mt-auto pt-3">
          <Button
            size="sm"
            className="w-full"
            disabled={checkoutMutation.isPending || previewMutation.isPending}
            onClick={() => onSubscribeClick("pro")}
          >
            {isSubscribed ? "Switch" : "Subscribe"}
          </Button>
        </div>
      )}
    </div>
  );
}
