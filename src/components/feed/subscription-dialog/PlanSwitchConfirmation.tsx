"use client";

import { useState } from "react";
import { CheckIcon } from "lucide-react";
import { INTERVAL_LABELS, PLAN_ICONS } from "./constants";
import { formatDate, formatPrice, getPlanFeatures } from "./utils";
import type { CardRadioOption } from "~/components/ui/card-radio-group";
import type { BillingInterval } from "./constants";
import type { SwitchPreview } from "./types";
import { CardRadioGroup } from "~/components/ui/card-radio-group";
import { PLANS } from "~/server/subscriptions/plans";

export function PlanSwitchConfirmationContent({
  preview,
  onIntervalChange,
  monthlyPrice,
  annualPrice,
  currentBillingInterval,
}: {
  preview: SwitchPreview;
  onIntervalChange: (interval: BillingInterval) => void;
  monthlyPrice: number | null;
  annualPrice: number | null;
  currentBillingInterval: BillingInterval | null;
}) {
  const [selectedInterval, setSelectedInterval] = useState<BillingInterval>(
    preview.billingInterval,
  );

  const newPlan = PLANS[preview.newPlanId as keyof typeof PLANS];
  const features = getPlanFeatures(newPlan);
  const Icon = PLAN_ICONS[preview.newPlanId as keyof typeof PLAN_ICONS];
  const isFreePlan = preview.newPlanId === "free";
  const intervalLabel = isFreePlan ? null : INTERVAL_LABELS[selectedInterval];

  const isSamePlanSwitch = preview.currentPlanId === preview.newPlanId;
  const hasBothIntervals =
    !isFreePlan && monthlyPrice != null && annualPrice != null;

  const intervalOptions: Array<CardRadioOption<BillingInterval>> = [];
  if (monthlyPrice != null) {
    intervalOptions.push({
      value: "month",
      title: `Monthly — ${formatPrice(monthlyPrice)}/mo`,
      disabled: isSamePlanSwitch && currentBillingInterval === "month",
    });
  }
  if (annualPrice != null) {
    intervalOptions.push({
      value: "year",
      title: `Annual — ${formatPrice(annualPrice)}/yr`,
      description: `${formatPrice(Math.round(annualPrice / 12))}/mo`,
      disabled: isSamePlanSwitch && currentBillingInterval === "year",
    });
  }

  function handleIntervalChange(interval: BillingInterval) {
    setSelectedInterval(interval);
    onIntervalChange(interval);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-lg border p-4">
        <Icon size={20} className="shrink-0" />
        <div className="flex-1">
          <h3 className="font-medium">{preview.newPlanName} Plan</h3>
          <p className="text-muted-foreground text-sm">
            {isFreePlan
              ? "Free"
              : `${formatPrice(preview.newAmount)}/${intervalLabel}`}
          </p>
        </div>
      </div>
      {hasBothIntervals && (
        <CardRadioGroup
          value={selectedInterval}
          onValueChange={handleIntervalChange}
          options={intervalOptions}
          orientation="vertical"
        />
      )}
      <ul className="space-y-2">
        {features.map((feature) => (
          <li
            key={feature}
            className="text-muted-foreground flex items-center gap-2 text-sm"
          >
            <CheckIcon size={14} className="shrink-0" />
            {feature}
          </li>
        ))}
      </ul>
      {preview.isDowngrade ? (
        <div className="rounded-lg border p-4">
          <p className="text-sm font-medium">
            Your plan will change on {formatDate(preview.periodEnd)}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            You&apos;ll keep your current {preview.currentPlanName} plan
            features until the end of your billing period. After that,
            you&apos;ll be switched to the {preview.newPlanName} plan
            automatically.
          </p>
        </div>
      ) : preview.proratedAmount > 0 ? (
        <div className="rounded-lg border p-4">
          <p className="text-sm">
            <span className="text-muted-foreground">
              Estimated charge today:
            </span>{" "}
            <span className="font-medium">
              {formatPrice(preview.proratedAmount)}
            </span>
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            You&apos;ll be credited for the unused time on your current plan.
            The final amount may differ slightly based on your local tax rates.
          </p>
        </div>
      ) : null}
    </div>
  );
}
