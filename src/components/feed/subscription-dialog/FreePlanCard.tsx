"use client";

import { CheckIcon, CircleHelpIcon } from "lucide-react";
import { PLAN_ICONS, RECOMMENDATION_MESSAGES } from "./constants";
import { useSubscriptionDialogContext } from "./context";
import { formatDate, getPlanCardBorderClasses, getPlanFeatures } from "./utils";
import { Button } from "~/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { PLANS } from "~/server/subscriptions/plans";

export function FreePlanCard() {
  const {
    planId,
    recommendedPlanId,
    chosenPlanId,
    pendingSwitch,
    isSubscribed,
    onSwitchToFreeClick,
    isSwitchToFreeLoading,
  } = useSubscriptionDialogContext();

  const plan = PLANS.free;
  const isCurrent = planId === "free";
  const pendingDate =
    pendingSwitch?.planId === "free" ? pendingSwitch.appliesAt : null;
  const isPending = pendingDate != null;
  const isRecommended = recommendedPlanId === "free";
  const features = getPlanFeatures(plan);
  const Icon = PLAN_ICONS.free;

  return (
    <div
      className={`relative flex flex-col rounded-lg border p-4 ${getPlanCardBorderClasses(isCurrent, isRecommended)}`}
    >
      {(isCurrent || isRecommended || isPending) && (
        <div className="absolute -top-3 left-1/2 flex -translate-x-1/2 gap-1.5">
          {isCurrent && (
            <span className="bg-foreground text-background rounded-full px-3 py-0.5 text-xs font-medium">
              Current
            </span>
          )}
          {isPending && (
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
                {chosenPlanId === "free"
                  ? RECOMMENDATION_MESSAGES.currentFree
                  : RECOMMENDATION_MESSAGES.upgrade}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      )}
      <div className="flex items-center gap-2">
        <Icon size={20} className="shrink-0" />
        <h3 className="font-medium">{plan.name}</h3>
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
      {!isCurrent && isSubscribed && (
        <div className="mt-auto pt-3">
          <Button
            size="sm"
            className="w-full"
            disabled={isSwitchToFreeLoading}
            onClick={onSwitchToFreeClick}
          >
            Switch
          </Button>
        </div>
      )}
    </div>
  );
}
