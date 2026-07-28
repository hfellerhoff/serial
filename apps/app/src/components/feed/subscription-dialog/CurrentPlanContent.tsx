"use client";

import { CheckIcon } from "lucide-react";
import {
  BILLING_INTERVAL_DISPLAY,
  INTERVAL_LABELS,
  PLAN_ICONS,
} from "./constants";
import { formatDate, formatPrice, getPlanFeatures } from "./utils";
import { PLANS } from "~/server/subscriptions/plans";
import { Button } from "~/components/ui/button";

export function CurrentPlanContent({
  summary,
  pendingSwitch,
  onSwitchClick,
  onCancelPending,
  isCancelPending,
}: {
  summary: {
    planId: string;
    planName: string;
    amount: number | null;
    currency: string | null;
    billingInterval: "month" | "year" | null;
    currentPeriodEnd: string | null;
  };
  pendingSwitch:
    | {
        planId: string;
        billingInterval: "month" | "year" | null;
        appliesAt: string;
      }
    | null
    | undefined;
  onSwitchClick: () => void;
  onCancelPending: () => void;
  isCancelPending: boolean;
}) {
  const plan = PLANS[summary.planId as keyof typeof PLANS];
  const features = getPlanFeatures(plan);
  const Icon = PLAN_ICONS[summary.planId as keyof typeof PLAN_ICONS];
  const intervalLabel = summary.billingInterval
    ? INTERVAL_LABELS[summary.billingInterval]
    : null;

  const hasPrice = summary.amount != null && intervalLabel != null;
  const hasRenewalDate = summary.currentPeriodEnd != null;

  const hasPendingPlanChange =
    pendingSwitch != null && pendingSwitch.planId !== summary.planId;
  const hasPendingIntervalChange =
    pendingSwitch != null &&
    pendingSwitch.planId === summary.planId &&
    pendingSwitch.billingInterval != null &&
    pendingSwitch.billingInterval !== summary.billingInterval;
  const hasPendingSwitch = hasPendingPlanChange || hasPendingIntervalChange;
  const pendingPlan = hasPendingSwitch
    ? PLANS[pendingSwitch.planId as keyof typeof PLANS]
    : null;
  const PendingIcon = hasPendingSwitch
    ? PLAN_ICONS[pendingSwitch.planId as keyof typeof PLAN_ICONS]
    : null;
  const pendingFeatures = pendingPlan ? getPlanFeatures(pendingPlan) : [];
  const pendingIntervalLabel =
    hasPendingIntervalChange && pendingSwitch.billingInterval
      ? BILLING_INTERVAL_DISPLAY[pendingSwitch.billingInterval]
      : null;

  return (
    <div className="space-y-4">
      {hasPendingSwitch && pendingPlan && PendingIcon && (
        <>
          <div className="flex items-center gap-3 rounded-lg border border-dashed p-4">
            <PendingIcon size={20} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <h3 className="font-medium">
                {pendingPlan.name} Plan
                {pendingIntervalLabel && ` · ${pendingIntervalLabel}`}
              </h3>
              <p className="text-muted-foreground text-sm">
                Starting {formatDate(pendingSwitch.appliesAt)}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={isCancelPending}
              onClick={onCancelPending}
            >
              {isCancelPending ? "Canceling..." : "Cancel"}
            </Button>
          </div>
          <ul className="space-y-2">
            {pendingFeatures.map((feature) => (
              <li
                key={feature}
                className="text-muted-foreground flex items-center gap-2 text-sm"
              >
                <CheckIcon size={14} className="shrink-0" />
                {feature}
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="flex items-center gap-3 rounded-lg border p-4">
        <Icon size={20} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <h3 className="font-medium">
            {hasPendingSwitch
              ? `${summary.planName} Plan (Current)`
              : `${summary.planName} Plan`}
          </h3>
          <p className="text-muted-foreground text-sm">
            {hasPrice && `${formatPrice(summary.amount!)}/${intervalLabel}`}
            {hasPrice && hasRenewalDate && " · "}
            {hasRenewalDate &&
              (hasPendingSwitch
                ? `Until ${formatDate(summary.currentPeriodEnd!)}`
                : `Renews ${formatDate(summary.currentPeriodEnd!)}`)}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onSwitchClick}>
          Switch
        </Button>
      </div>
      {!hasPendingSwitch && (
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
      )}
    </div>
  );
}
