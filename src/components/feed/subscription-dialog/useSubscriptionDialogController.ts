"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { getRecommendedPlanId } from "./utils";
import type { BillingInterval } from "./constants";
import type { SubscriptionDialogContextValue } from "./context";
import type { SwitchPreview } from "./types";
import type { PaidPlanId } from "~/server/subscriptions/plans";
import { useDialogStore } from "~/components/feed/dialogStore";
import { useSession } from "~/lib/auth-client";
import { useFeeds } from "~/lib/data/feeds/store";
import { usePlanSuccessStore } from "~/lib/data/plan-success";
import { useSubscription } from "~/lib/data/subscription";
import { orpc } from "~/lib/orpc";
import { PLAN_IDS, PLANS } from "~/server/subscriptions/plans";

export function useSubscriptionDialogController({
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
  const subscriptionView = useDialogStore((state) => state.subscriptionView);
  const [showPlanPicker, setShowPlanPicker] = useState(
    subscriptionView === "picker",
  );
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
        if (result.url) window.location.assign(result.url);
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
  const openPlanSuccess = usePlanSuccessStore((state) => state.openDialog);
  const switchMutation = useMutation(
    orpc.subscription.switchPlan.mutationOptions({
      onSuccess: (result) => {
        if (!result.success) return;
        setSwitchPreview(null);
        onOpenChange(false);
        void queryClient
          .invalidateQueries({
            queryKey: orpc.subscription.getStatus.queryOptions().queryKey,
          })
          .then(openPlanSuccess);
      },
      onError: () => toast.error("Failed to switch plan. Please try again."),
    }),
  );
  const portalMutation = useMutation(
    orpc.subscription.createPortalSession.mutationOptions({
      onSuccess: (result) => {
        if (result.url) window.location.assign(result.url);
      },
    }),
  );
  const revertPendingMutation = useMutation(
    orpc.subscription.revertPendingChange.mutationOptions({
      onSuccess: (result) => {
        if (!result.success) return;
        toast.success("Pending change cancelled.");
        void queryClient.invalidateQueries({
          queryKey: orpc.subscription.getPendingSwitch.queryOptions().queryKey,
        });
        void queryClient.invalidateQueries({
          queryKey:
            orpc.subscription.getSubscriptionSummary.queryOptions().queryKey,
        });
        void queryClient.invalidateQueries({
          queryKey: orpc.subscription.getStatus.queryOptions().queryKey,
        });
      },
      onError: () =>
        toast.error("Failed to cancel pending change. Please try again."),
    }),
  );
  const downgradePreviewMutation = useMutation(
    orpc.subscription.previewDowngrade.mutationOptions({
      onSuccess: (result) => {
        if (!result) {
          toast.error("Unable to preview switch");
          return;
        }
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
      },
    }),
  );
  const cancelMutation = useMutation(
    orpc.subscription.cancelSubscription.mutationOptions({
      onSuccess: (result) => {
        if (!result.success) return;
        setSwitchPreview(null);
        onOpenChange(false);
        toast.success(
          "Your plan will switch at the end of your billing period.",
        );
        void queryClient.invalidateQueries({
          queryKey: orpc.subscription.getStatus.queryOptions().queryKey,
        });
        void queryClient.invalidateQueries({
          queryKey: orpc.subscription.getPendingSwitch.queryOptions().queryKey,
        });
      },
      onError: () =>
        toast.error("Failed to cancel subscription. Please try again."),
    }),
  );

  const feeds = useFeeds();
  const recommendedPlanId = getRecommendedPlanId(
    feeds.length,
    PLAN_IDS.indexOf(planId),
  );

  function handleSubscribeClick(id: PaidPlanId) {
    setPendingPlanId(id);
    if (isSubscribed) {
      previewMutation.mutate({ planId: id });
      return;
    }
    checkoutMutation.mutate({
      planId: id,
      returnPath: window.location.pathname,
    });
  }

  async function handleVerified() {
    await refetchSession();
    setShowVerification(false);
    if (!pendingPlanId) return;
    if (isSubscribed) {
      previewMutation.mutate({ planId: pendingPlanId });
      return;
    }
    checkoutMutation.mutate({
      planId: pendingPlanId,
      returnPath: window.location.pathname,
    });
  }

  const contextValue: SubscriptionDialogContextValue = {
    planId,
    recommendedPlanId,
    chosenPlanId: pendingSwitch?.planId ?? planId,
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
      previewMutation.mutate({
        planId: subscriptionSummary.planId,
        billingInterval: interval,
      });
    },
    portalMutation,
    checkoutMutation,
    previewMutation,
  };
  const showOverview =
    isSubscribed &&
    !showPlanPicker &&
    !switchPreview &&
    (isLoadingSummary || subscriptionSummary != null);

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      onOpenChange(true);
    } else if (switchPreview) {
      setSwitchPreview(null);
    } else if (showPlanPicker && isSubscribed) {
      setShowPlanPicker(false);
    } else {
      setShowPlanPicker(false);
      onOpenChange(false);
    }
  }

  return {
    cancelMutation,
    contextValue,
    emailVerified,
    handleOpenChange,
    handleVerified,
    isLoadingSummary,
    isPlanPickerView: !switchPreview && !showOverview,
    isSubscribed,
    pendingSwitch,
    portalMutation,
    previewMutation,
    products,
    revertPendingMutation,
    setShowPlanPicker,
    setSwitchPreview,
    showOverview,
    showVerification,
    subscriptionSummary,
    switchMutation,
    switchPreview,
  };
}

export type SubscriptionDialogController = ReturnType<
  typeof useSubscriptionDialogController
>;
