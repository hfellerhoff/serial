"use client";

import { useAutoAnimate } from "@formkit/auto-animate/react";
import { useSelector } from "@xstate/react";
import { useEffect } from "react";
import { loadingActor } from "~/lib/data/loading-machine";

interface UseDeferredAutoAnimateOptions {
  disabled?: boolean;
}

/**
 * Wraps useAutoAnimate but keeps animations disabled while the loading
 * machine is in the `initialLoad` state. This prevents cached items
 * and incoming SSE diff data from being animated on initial page load.
 *
 * Once the machine leaves `initialLoad` (i.e. INITIAL_DATA_COMPLETE fires),
 * auto-animate is enabled after a single rAF so the settled render paints
 * first. All subsequent states (backgroundRefresh, manualRefresh, etc.)
 * are animated normally.
 */
export function useDeferredAutoAnimate<T extends HTMLElement>({
  disabled = false,
}: UseDeferredAutoAnimateOptions = {}) {
  const [parent, enable] = useAutoAnimate<T>();
  const isInitialLoad = useSelector(loadingActor, (s) =>
    s.matches("initialLoad"),
  );
  const shouldDisableAutoAnimate = isInitialLoad || disabled;

  useEffect(() => {
    if (shouldDisableAutoAnimate) {
      enable(false);
      return;
    }

    // Not in initialLoad — enable after the current frame paints so we
    // don't animate the render that caused the transition.
    const id = requestAnimationFrame(() => {
      enable(true);
    });
    return () => cancelAnimationFrame(id);
  }, [shouldDisableAutoAnimate, enable]);

  return [parent] as const;
}
