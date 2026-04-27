"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "../ui/button";

function showUpdatePrompt(reg: ServiceWorkerRegistration) {
  const toastId = toast("A new version of Serial is available!", {
    action: (
      <Button
        size="sm"
        onClick={() => {
          // Tell the waiting service worker to skip waiting
          reg.waiting?.postMessage({ type: "SKIP_WAITING" });
          toast.dismiss(toastId);
        }}
      >
        Update
      </Button>
    ),
    cancel: (
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          toast.dismiss(toastId);
        }}
      >
        Later
      </Button>
    ),
    duration: Infinity,
  });
}

export function ReloadPrompt() {
  const hasPromptedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const registerServiceWorker = async () => {
      try {
        // Track whether a SW was already controlling this page. On a fresh
        // install the controller is null; on an update it's the old SW.
        // We use this to distinguish first-install (don't reload — the
        // activate handler warms the cache) from updates (reload to pick up
        // the new SW).
        const hadController = !!navigator.serviceWorker.controller;

        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });

        // Check for updates
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              // New content is available, show update prompt
              if (!hasPromptedRef.current) {
                hasPromptedRef.current = true;
                showUpdatePrompt(reg);
              }
            }
          });
        });

        // Handle controller change (after skipWaiting on update).
        // On first install, clients.claim() fires controllerchange (null →
        // new SW). We intentionally skip the reload in that case to avoid a
        // jarring double page-load — the activate handler already warms the
        // navigation cache for offline support.
        let refreshing = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (!refreshing && hadController) {
            refreshing = true;
            window.location.reload();
          }
        });

        // iOS Safari: force an update check. Safari caches the SW script
        // itself more aggressively than Chrome, so an explicit update()
        // ensures the user gets the latest SW on each visit.
        await reg.update().catch(() => {
          // Non-critical — the browser will still check within 24 hours.
        });

        // iOS Safari: re-warm the navigation cache on every launch. iOS
        // evicts all cached data after ~7 days of inactivity. The activate
        // handler only runs once (on install/update), so each online visit
        // needs to reset that clock by re-caching the root page.
        const activeWorker = reg.active ?? reg.installing ?? reg.waiting;
        activeWorker?.postMessage({ type: "WARM_NAVIGATION_CACHE" });
      } catch (error) {
        console.error("Service worker registration failed:", error);
      }
    };

    void registerServiceWorker();
  }, []);

  return null;
}
