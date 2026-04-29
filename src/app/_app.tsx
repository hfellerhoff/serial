import "~/styles/globals.css";

import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { CheckIcon } from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";
import { AppDialogs } from "../components/feed/AppDialogs";
import { Header } from "../components/feed/Header";
import type React from "react";
import FeedLoading from "~/components/loading";
import { AppLeftSidebar, AppRightSidebar } from "~/components/app-sidebar";
import { Button } from "~/components/ui/button";
import { ControlledResponsiveDialog } from "~/components/ui/responsive-dropdown";
import { useDialogStore } from "~/components/feed/dialogStore";
import { ImpersonationBanner } from "~/components/ImpersonationBanner";
import { ReleaseNotifier } from "~/components/releases/ReleaseNotifier";
import { SidebarInset, SidebarProvider } from "~/components/ui/sidebar";
import { InitialClientQueries } from "~/lib/data/InitialClientQueries";
import { loadingActor } from "~/lib/data/loading-machine";
import { usePlanSuccessStore } from "~/lib/data/plan-success";
import { useSubscription } from "~/lib/data/subscription";
import { useAltKeyHeld } from "~/lib/hooks/useAltKeyHeld";
import { authMiddleware } from "~/server/auth";
import { getMostRecentRelease } from "~/lib/markdown/loaders";
import { orpc, orpcRouterClient } from "~/lib/orpc";
import { PLANS } from "~/server/subscriptions/plans";
import {
  getPlanFeatures,
  PLAN_ICONS,
} from "~/components/feed/subscription-dialog";
import { env } from "~/env";

export const Route = createFileRoute("/_app")({
  component: RootLayout,
  server: {
    middleware: [authMiddleware],
  },
  beforeLoad: () => {
    if (env.VITE_PUBLIC_IS_MAINTENANCE_MODE === "true") {
      throw redirect({
        to: "/maintenance",
      });
    }
  },
  loader: () => {
    const mostRecentRelease = getMostRecentRelease();
    return { mostRecentRelease };
  },
});

const MAX_SYNC_ATTEMPTS = 10;
const SYNC_POLL_INTERVAL_MS = 3_000;

function useCheckoutSuccess() {
  const queryClient = useQueryClient();
  const [awaitingUpgrade, setAwaitingUpgrade] = useState(false);
  const { planId, billingEnabled } = useSubscription();
  const openPlanSuccess = usePlanSuccessStore((s) => s.openDialog);
  const previousPlanIdRef = useRef<string | null>(null);
  const hasProcessedCheckout = useRef(false);

  // Detect checkout_success query param (waits for billingEnabled to resolve)
  useEffect(() => {
    if (!billingEnabled) return;
    if (hasProcessedCheckout.current) return;

    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout_success") !== "true") return;

    hasProcessedCheckout.current = true;

    // Remove the query param from the URL
    params.delete("checkout_success");
    const newUrl =
      window.location.pathname +
      (params.size > 0 ? `?${params.toString()}` : "");
    window.history.replaceState({}, "", newUrl);

    // Snapshot the current plan so we can detect when it changes
    previousPlanIdRef.current = planId;
    setAwaitingUpgrade(true);
  }, [billingEnabled, planId]);

  // Eagerly sync after checkout, then poll if needed
  useEffect(() => {
    if (!awaitingUpgrade) return;

    const previousPlanId = previousPlanIdRef.current;

    // Check if plan has already changed (e.g. webhook arrived fast)
    if (previousPlanId !== null && planId !== previousPlanId) {
      setAwaitingUpgrade(false);
      openPlanSuccess();
      return;
    }

    const controller = new AbortController();
    let attempts = 0;
    let isSyncing = false;

    const sync = async (): Promise<boolean> => {
      if (isSyncing) return false;
      isSyncing = true;
      try {
        const result = await orpcRouterClient.subscription.syncAfterCheckout();

        if (controller.signal.aborted) return false;

        // Update the getStatus query data with the fresh result
        queryClient.setQueryData(
          orpc.subscription.getStatus.queryOptions().queryKey,
          result,
        );

        const planChanged =
          previousPlanId !== null && result.planId !== previousPlanId;
        if (planChanged) {
          // Clear the stale refresh cooldown so the button re-enables
          // immediately with the new plan's interval.
          loadingActor.send({
            type: "REFRESH_COOLDOWN_UPDATE",
            nextRefreshAt: null,
          });

          setAwaitingUpgrade(false);
          openPlanSuccess();
          return true;
        }
      } catch {
        // Ignore errors, will retry
      } finally {
        isSyncing = false;
      }
      return false;
    };

    // First attempt immediately, then poll with interval
    void sync().then((done) => {
      if (done || controller.signal.aborted) return;

      const interval = setInterval(() => {
        if (controller.signal.aborted) {
          clearInterval(interval);
          return;
        }

        attempts++;
        void sync().then((done) => {
          if (done || attempts >= MAX_SYNC_ATTEMPTS) {
            clearInterval(interval);
            if (!done) {
              // Give up gracefully — user will see the upgrade on next load
              setAwaitingUpgrade(false);
            }
          }
        });
      }, SYNC_POLL_INTERVAL_MS);
    });

    return () => {
      controller.abort();
    };
  }, [awaitingUpgrade, planId, queryClient, openPlanSuccess]);

  return { awaitingUpgrade, billingEnabled };
}

/**
 * Detect ?subscription=open query param (set by the Polar portal return URL)
 * and re-open the subscription dialog.
 */
function usePortalReturn() {
  const launchDialog = useDialogStore((s) => s.launchDialog);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("subscription") !== "open") return;

    // Clean the query param from the URL
    params.delete("subscription");
    const newUrl =
      window.location.pathname +
      (params.size > 0 ? `?${params.toString()}` : "");
    window.history.replaceState({}, "", newUrl);

    launchDialog("subscription");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

function CheckoutSuccessDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { planId } = useSubscription();
  const plan = PLANS[planId];
  const features = getPlanFeatures(plan);
  const Icon = PLAN_ICONS[planId] ?? PLAN_ICONS.free;

  return (
    <ControlledResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Welcome to Serial"
      description="Your subscription is now active. Thank you for your support!"
      headerClassName="text-center"
    >
      <div className="flex flex-col items-center gap-4 pt-4">
        <div className="bg-primary/10 flex size-12 items-center justify-center rounded-full">
          <Icon size={24} className="text-primary" />
        </div>
        <h3 className="text-lg font-semibold">{plan.name} Plan</h3>
        <ul className="w-full space-y-2">
          {features.map((feature) => (
            <li key={feature} className="flex items-center gap-2 text-sm">
              <CheckIcon size={16} className="text-primary shrink-0" />
              {feature}
            </li>
          ))}
        </ul>
        <Button className="mt-2 w-full" onClick={() => onOpenChange(false)}>
          Get Started
        </Button>
      </div>
    </ControlledResponsiveDialog>
  );
}

function RootLayout() {
  const { mostRecentRelease } = Route.useLoaderData();
  useAltKeyHeld();
  usePortalReturn();
  const { awaitingUpgrade, billingEnabled } = useCheckoutSuccess();
  const showPlanSuccess = usePlanSuccessStore((s) => s.showDialog);
  const closePlanSuccess = usePlanSuccessStore((s) => s.closeDialog);

  if (awaitingUpgrade) {
    return <FeedLoading />;
  }

  return (
    // <ApplyColorTheme>
    <Suspense fallback={<FeedLoading />}>
      <InitialClientQueries>
        <ImpersonationBanner />
        <SidebarProvider
          style={
            {
              "--sidebar-width": "calc(var(--spacing) * 72)",
              "--header-height": "calc(var(--spacing) * 12)",
            } as React.CSSProperties
          }
        >
          <AppLeftSidebar />
          <SidebarInset>
            <Header />
            <main className="flex flex-col">
              <div className="h-full w-full pb-6">
                <Outlet />
              </div>
              <AppDialogs />
              {billingEnabled && (
                <CheckoutSuccessDialog
                  open={showPlanSuccess}
                  onOpenChange={closePlanSuccess}
                />
              )}
            </main>
            <ReleaseNotifier mostRecentRelease={mostRecentRelease} />
          </SidebarInset>
          <AppRightSidebar />
        </SidebarProvider>
      </InitialClientQueries>
    </Suspense>
    // </ApplyColorTheme>
  );
}
