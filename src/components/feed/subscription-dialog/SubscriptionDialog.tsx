"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { BILLING_INTERVAL_DISPLAY } from "./constants";
import { SubscriptionDialogContext } from "./context";
import { CurrentPlanContent } from "./CurrentPlanContent";
import { EmailVerificationBanner } from "./EmailVerificationBanner";
import { FreePlanCard } from "./FreePlanCard";
import { PlanSwitchConfirmationContent } from "./PlanSwitchConfirmation";
import { ProPlanCard } from "./ProPlanCard";
import { StandardPlanCards } from "./StandardPlanCards";
import { getRecommendedPlanId } from "./utils";
import type { BillingInterval } from "./constants";
import type { SubscriptionDialogContextValue } from "./context";
import type { SwitchPreview } from "./types";
import type { PaidPlanId } from "~/server/subscriptions/plans";
import { Button } from "~/components/ui/button";
import { ControlledResponsiveDialog } from "~/components/ui/responsive-dropdown";
import { Skeleton } from "~/components/ui/skeleton";
import { useSession } from "~/lib/auth-client";
import { useFeeds } from "~/lib/data/feeds/store";
import { usePlanSuccessStore } from "~/lib/data/plan-success";
import { useSubscription } from "~/lib/data/subscription";
import { orpc } from "~/lib/orpc";
import { PLAN_IDS, PLANS } from "~/server/subscriptions/plans";
import { useDialogStore } from "~/components/feed/dialogStore";
import { env } from "~/env";

export function SubscriptionDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { planId } = useSubscription();
  const { data: session, refetch: refetchSession } = useSession();
  const queryClient = useQueryClient();
  const [showVerification, setShowVerification] = useState(false);
  const [pendingPlanId, setPendingPlanId] = useState<PaidPlanId | null>(null);
  const [switchPreview, setSwitchPreview] = useState<SwitchPreview | null>(
    null,
  );
  const [showPlanPicker, setShowPlanPicker] = useState(false);
  const subscriptionView = useDialogStore((s) => s.subscriptionView);
  const prevOpenRef = useRef(false);

  // Reset dialog state when it opens, respecting the requested view
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setSwitchPreview(null);
      setShowVerification(false);
      setShowPlanPicker(subscriptionView === "picker");
    }
    prevOpenRef.current = open;
  }, [open, subscriptionView]);

  const emailVerified = session?.user?.emailVerified ?? false;
  const isSubscribed = planId !== "free";

  const { data: products, isLoading: isLoadingProducts } = useQuery({
    ...orpc.subscription.getProducts.queryOptions(),
    enabled: open,
  });

  const { data: pendingSwitch } = useQuery({
    ...orpc.subscription.getPendingSwitch.queryOptions(),
    enabled: open,
  });

  const { data: subscriptionSummary, isLoading: isLoadingSummary } = useQuery({
    ...orpc.subscription.getSubscriptionSummary.queryOptions(),
    enabled: open && isSubscribed,
  });

  const checkoutMutation = useMutation(
    orpc.subscription.createCheckout.mutationOptions({
      onSuccess: (result) => {
        if (result.error === "email-not-verified") {
          setShowVerification(true);
          toast.error("Please verify your email before subscribing");
          return;
        }
        if (result.url) {
          window.location.assign(result.url);
        }
      },
    }),
  );

  const previewMutation = useMutation(
    orpc.subscription.previewPlanSwitch.mutationOptions({
      onSuccess: (result) => {
        if (result) {
          setSwitchPreview(result);
        } else {
          toast.error("Unable to preview plan switch");
        }
      },
    }),
  );

  const openPlanSuccess = usePlanSuccessStore((s) => s.openDialog);

  const switchMutation = useMutation(
    orpc.subscription.switchPlan.mutationOptions({
      onSuccess: (result) => {
        if (result.success) {
          setSwitchPreview(null);
          onOpenChange(false);
          // Invalidate and then show success dialog
          void queryClient
            .invalidateQueries({
              queryKey: orpc.subscription.getStatus.queryOptions().queryKey,
            })
            .then(() => {
              openPlanSuccess();
            });
        }
      },
      onError: () => {
        toast.error("Failed to switch plan. Please try again.");
      },
    }),
  );

  const portalMutation = useMutation(
    orpc.subscription.createPortalSession.mutationOptions({
      onSuccess: (result) => {
        if (result.url) {
          window.location.assign(result.url);
        }
      },
    }),
  );

  const revertPendingMutation = useMutation(
    orpc.subscription.revertPendingChange.mutationOptions({
      onSuccess: (result) => {
        if (result.success) {
          toast.success("Pending change cancelled.");
          void queryClient.invalidateQueries({
            queryKey:
              orpc.subscription.getPendingSwitch.queryOptions().queryKey,
          });
          void queryClient.invalidateQueries({
            queryKey:
              orpc.subscription.getSubscriptionSummary.queryOptions().queryKey,
          });
          void queryClient.invalidateQueries({
            queryKey: orpc.subscription.getStatus.queryOptions().queryKey,
          });
        }
      },
      onError: () => {
        toast.error("Failed to cancel pending change. Please try again.");
      },
    }),
  );

  const downgradePreviewMutation = useMutation(
    orpc.subscription.previewDowngrade.mutationOptions({
      onSuccess: (result) => {
        if (result) {
          setSwitchPreview({
            currentPlanId: result.currentPlanId,
            currentPlanName: result.currentPlanName,
            currentAmount: 0,
            newPlanId: "free",
            newPlanName: PLANS.free.name,
            newAmount: 0,
            proratedAmount: 0,
            isDowngrade: true,
            periodEnd: result.periodEnd,
            currency: "usd",
            billingInterval: "month",
            subscriptionId: result.subscriptionId,
            newProductId: "",
          });
        } else {
          toast.error("Unable to preview switch");
        }
      },
    }),
  );

  const cancelMutation = useMutation(
    orpc.subscription.cancelSubscription.mutationOptions({
      onSuccess: (result) => {
        if (result.success) {
          setSwitchPreview(null);
          onOpenChange(false);
          toast.success(
            "Your plan will switch at the end of your billing period.",
          );
          void queryClient.invalidateQueries({
            queryKey: orpc.subscription.getStatus.queryOptions().queryKey,
          });
          void queryClient.invalidateQueries({
            queryKey:
              orpc.subscription.getPendingSwitch.queryOptions().queryKey,
          });
        }
      },
      onError: () => {
        toast.error("Failed to cancel subscription. Please try again.");
      },
    }),
  );

  const feeds = useFeeds();

  // Recommend the smallest plan that fits the user's feed count,
  // but never recommend a lower-tier plan than the user's current plan
  const currentPlanIndex = PLAN_IDS.indexOf(planId);
  const recommendedPlanId = getRecommendedPlanId(
    feeds.length,
    currentPlanIndex,
  );
  const chosenPlanId = pendingSwitch?.planId ?? planId;

  function handleSubscribeClick(id: PaidPlanId) {
    setPendingPlanId(id);
    if (isSubscribed) {
      // Already subscribed — show switch confirmation
      previewMutation.mutate({ planId: id });
    } else {
      checkoutMutation.mutate({
        planId: id,
        returnPath: window.location.pathname,
      });
    }
  }

  async function handleVerified() {
    await refetchSession();
    setShowVerification(false);
    if (pendingPlanId) {
      if (isSubscribed) {
        previewMutation.mutate({ planId: pendingPlanId });
      } else {
        checkoutMutation.mutate({
          planId: pendingPlanId,
          returnPath: window.location.pathname,
        });
      }
    }
  }

  const contextValue: SubscriptionDialogContextValue = {
    planId,
    recommendedPlanId,
    chosenPlanId,
    isSubscribed,
    products,
    isLoadingProducts,
    pendingSwitch,
    onSubscribeClick: handleSubscribeClick,
    onSwitchToFreeClick: () => downgradePreviewMutation.mutate({}),
    isSwitchToFreeLoading: downgradePreviewMutation.isPending,
    currentBillingInterval:
      (subscriptionSummary?.billingInterval as BillingInterval | null) ?? null,
    onBillingCycleSwitch: (interval: BillingInterval) => {
      if (!subscriptionSummary) return;
      const paidPlanId = subscriptionSummary.planId;
      previewMutation.mutate({ planId: paidPlanId, billingInterval: interval });
    },
    portalMutation,
    checkoutMutation,
    previewMutation,
  };

  // Determine current view
  const showOverview =
    isSubscribed &&
    !showPlanPicker &&
    !switchPreview &&
    (isLoadingSummary || subscriptionSummary != null);
  const isPlanPickerView = !switchPreview && !showOverview;
  const isSwitchToFree = switchPreview?.newPlanId === "free";

  let dialogTitle: string;
  let dialogDescription: string;
  let dialogFooter: React.ReactNode;
  let dialogOnBack: (() => void) | undefined;

  const isBillingCycleSwitch =
    switchPreview != null &&
    switchPreview.currentPlanId === switchPreview.newPlanId;

  if (switchPreview) {
    const billingCycleLabel =
      BILLING_INTERVAL_DISPLAY[switchPreview.billingInterval];
    dialogTitle = "Switch Plan";
    dialogDescription = isBillingCycleSwitch
      ? `Switch to ${billingCycleLabel} plan`
      : `Switch from ${switchPreview.currentPlanName} to ${switchPreview.newPlanName}`;
    dialogOnBack = () => setSwitchPreview(null);
    dialogFooter = isSwitchToFree ? (
      <Button
        className="w-full"
        onClick={() => cancelMutation.mutate({})}
        disabled={cancelMutation.isPending}
      >
        {cancelMutation.isPending
          ? "Switching..."
          : `Confirm Switch to ${switchPreview.newPlanName}`}
      </Button>
    ) : (
      <Button
        className="w-full"
        onClick={() =>
          switchMutation.mutate({
            subscriptionId: switchPreview.subscriptionId,
            newProductId: switchPreview.newProductId,
          })
        }
        disabled={switchMutation.isPending || previewMutation.isPending}
      >
        {switchMutation.isPending
          ? "Switching..."
          : `Confirm Switch to ${switchPreview.newPlanName}`}
      </Button>
    );
  } else if (showOverview) {
    dialogTitle = "Your Plan";
    dialogDescription = "Manage your current subscription.";
    dialogFooter = (
      <Button
        className="w-full"
        disabled={portalMutation.isPending}
        onClick={() => portalMutation.mutate({})}
      >
        {portalMutation.isPending ? "Loading..." : "Open Billing Portal"}
      </Button>
    );
  } else {
    dialogTitle = "Subscribe to Serial";
    dialogDescription = "All prices are taxes-included.";
    dialogOnBack = isSubscribed ? () => setShowPlanPicker(false) : undefined;
    dialogFooter = (
      <p className="text-muted-foreground flex flex-col text-center text-sm">
        Price too high or need higher limits?{" "}
        <span>
          <a
            href={`mailto:${env.VITE_PUBLIC_SUPPORT_EMAIL_ADDRESS}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Let us know
          </a>{" "}
          or{" "}
          <a
            href="https://github.com/hfellerhoff/serial?tab=readme-ov-file#self-hosting"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            learn how to self-host
          </a>{" "}
          Serial
        </span>
      </p>
    );
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      if (switchPreview) {
        setSwitchPreview(null);
        return;
      }
      if (showPlanPicker && isSubscribed) {
        setShowPlanPicker(false);
        return;
      }
      setShowPlanPicker(false);
      onOpenChange(false);
      return;
    }
    onOpenChange(nextOpen);
  }

  const newPlanProduct = switchPreview
    ? products?.find((p) => p.planId === switchPreview.newPlanId)
    : undefined;

  return (
    <SubscriptionDialogContext.Provider value={contextValue}>
      <ControlledResponsiveDialog
        open={open}
        onOpenChange={handleOpenChange}
        title={dialogTitle}
        description={dialogDescription}
        className={isPlanPickerView ? "lg:max-w-5xl xl:max-w-6xl" : undefined}
        headerClassName={isPlanPickerView ? "lg:text-center" : undefined}
        onBack={dialogOnBack}
        footer={dialogFooter}
      >
        {switchPreview ? (
          <PlanSwitchConfirmationContent
            preview={switchPreview}
            onIntervalChange={(interval) =>
              previewMutation.mutate({
                planId: switchPreview.newPlanId as PaidPlanId,
                billingInterval: interval,
              })
            }
            monthlyPrice={newPlanProduct?.monthlyPrice ?? null}
            annualPrice={newPlanProduct?.annualPrice ?? null}
            currentBillingInterval={
              (subscriptionSummary?.billingInterval as BillingInterval | null) ??
              null
            }
          />
        ) : showOverview ? (
          isLoadingSummary ? (
            <div className="space-y-4">
              <Skeleton className="h-[72px] w-full rounded-lg" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-5 w-44" />
              </div>
            </div>
          ) : subscriptionSummary ? (
            <CurrentPlanContent
              summary={subscriptionSummary}
              pendingSwitch={pendingSwitch}
              onSwitchClick={() => setShowPlanPicker(true)}
              onCancelPending={() => revertPendingMutation.mutate({})}
              isCancelPending={revertPendingMutation.isPending}
            />
          ) : null
        ) : (
          <div className="mt-2 grid gap-3 lg:grid-cols-[1fr_1.5fr_1fr] lg:gap-5 xl:grid-cols-[1fr_2fr_1fr]">
            {showVerification && !emailVerified && (
              <div className="col-span-full">
                <EmailVerificationBanner onVerified={handleVerified} />
              </div>
            )}

            {/* Free plan */}
            <FreePlanCard />

            {/* Paid plans */}
            <StandardPlanCards />

            {/* Pro plan */}
            <ProPlanCard />
          </div>
        )}
      </ControlledResponsiveDialog>
    </SubscriptionDialogContext.Provider>
  );
}
