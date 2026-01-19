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

        // Handle controller change (after skipWaiting)
        let refreshing = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (!refreshing) {
            refreshing = true;
            window.location.reload();
          }
        });
      } catch (error) {
        console.error("Service worker registration failed:", error);
      }
    };

    void registerServiceWorker();
  }, []);

  return null;
}
