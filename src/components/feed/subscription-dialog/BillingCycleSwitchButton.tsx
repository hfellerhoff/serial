"use client";

import type { BillingInterval } from "./constants";
import { Button } from "~/components/ui/button";

export function BillingCycleSwitchButton({
  currentInterval,
  onSwitch,
  isPending,
}: {
  currentInterval: BillingInterval;
  onSwitch: (interval: BillingInterval) => void;
  isPending: boolean;
}) {
  const alternateInterval: BillingInterval =
    currentInterval === "month" ? "year" : "month";

  return (
    <Button
      size="sm"
      disabled={isPending}
      onClick={() => onSwitch(alternateInterval)}
    >
      Switch
    </Button>
  );
}
