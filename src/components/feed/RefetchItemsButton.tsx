"use client";

import { useLocation } from "@tanstack/react-router";
import clsx from "clsx";
import { CheckIcon, RefreshCwIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ButtonWithShortcut } from "~/components/ButtonWithShortcut";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import {
  useIsLoadingActive,
  useLoadingMode,
  useNextRefreshAt,
} from "~/lib/data/loading-machine";
import { useFetchNewData } from "~/lib/data/store";
import { useShortcut } from "~/lib/hooks/useShortcut";

function formatRelativeTime(targetMs: number, now: number): string {
  const diffMs = targetMs - now;
  if (diffMs <= 0) return "now";
  const diffSec = Math.ceil(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.ceil(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.ceil(diffMin / 60);
  return `${diffHr}h`;
}

export function RefetchItemsButton() {
  const location = useLocation();
  const fetchNewData = useFetchNewData();
  const loading = useLoadingMode();
  const nextRefreshAt = useNextRefreshAt();

  // Track current time in state so the cooldown check is pure during render.
  // Only updated via the timeout callback (async) to satisfy the lint rule.
  const [now, setNow] = useState(() => Date.now());

  const isMachineActive = useIsLoadingActive();
  const isRateLimited = nextRefreshAt !== null && nextRefreshAt > now;

  const isRefreshing = isMachineActive;
  const isDisabled =
    isRefreshing ||
    isRateLimited ||
    loading.mode === "initialLoad" ||
    loading.mode === "backgroundRefresh";

  // Show check icon when the user is up to date (cooldown active),
  // refresh icon when they can refresh again (cooldown expired/absent).
  const showCheck = isRateLimited && !isMachineActive;

  // Tick `now` so the tooltip text updates live and the button re-enables
  // when cooldown expires. Uses chained timeouts so the tick interval
  // adapts as the remaining time shrinks (every second when <2min,
  // every 20s otherwise). Max delay is 20s so long cooldowns still feel
  // responsive.
  useEffect(() => {
    if (nextRefreshAt === null) return;

    let timeoutId: ReturnType<typeof setTimeout>;

    const scheduleTick = () => {
      const remaining = nextRefreshAt - Date.now();
      if (remaining <= 0) {
        setNow(Date.now());
        return; // expired, no more ticks needed
      }
      const delayMs = remaining <= 2 * 60 * 1000 ? 1_000 : 20_000;
      timeoutId = setTimeout(() => {
        setNow(Date.now());
        scheduleTick();
      }, delayMs);
    };

    setNow(Date.now());
    scheduleTick();

    return () => clearTimeout(timeoutId);
  }, [nextRefreshAt]);

  const onClick = useCallback(async () => {
    if (isDisabled) return;
    await fetchNewData();
  }, [fetchNewData, isDisabled]);

  useShortcut("r", onClick);

  if (location.pathname !== "/") return null;

  const button = (
    <ButtonWithShortcut
      size="icon md:default"
      variant="outline"
      onClick={onClick}
      disabled={isDisabled}
      shortcut="r"
    >
      {showCheck ? (
        <CheckIcon size={16} />
      ) : (
        <RefreshCwIcon
          size={16}
          className={clsx({
            "animate-spin": isRefreshing,
          })}
        />
      )}
      <span className="hidden pl-1.5 md:block">Refresh</span>
    </ButtonWithShortcut>
  );

  if (isRateLimited) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- needed so tooltip opens on a disabled button */}
          <span tabIndex={0}>{button}</span>
        </TooltipTrigger>
        <TooltipContent>
          Refresh available in{" "}
          <span className="font-mono">
            {formatRelativeTime(nextRefreshAt, now)}
          </span>
        </TooltipContent>
      </Tooltip>
    );
  }

  return button;
}
