import { CurrentPlanContent } from "./CurrentPlanContent";
import { EmailVerificationBanner } from "./EmailVerificationBanner";
import { FreePlanCard } from "./FreePlanCard";
import { PlanSwitchConfirmationContent } from "./PlanSwitchConfirmation";
import { ProPlanCard } from "./ProPlanCard";
import { StandardPlanCards } from "./StandardPlanCards";
import type { BillingInterval } from "./constants";
import type { SubscriptionDialogController } from "./useSubscriptionDialogController";
import type { PaidPlanId } from "~/server/subscriptions/plans";
import { Skeleton } from "~/components/ui/skeleton";

export function SubscriptionDialogBody({
  controller,
}: {
  controller: SubscriptionDialogController;
}) {
  const {
    emailVerified,
    handleVerified,
    isLoadingSummary,
    pendingSwitch,
    previewMutation,
    products,
    revertPendingMutation,
    setShowPlanPicker,
    showOverview,
    showVerification,
    subscriptionSummary,
    switchPreview,
  } = controller;

  if (switchPreview) {
    const newPlanProduct = products?.find(
      (product) => product.planId === switchPreview.newPlanId,
    );
    return (
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
    );
  }

  if (showOverview) {
    if (isLoadingSummary) return <SubscriptionSummarySkeleton />;
    if (!subscriptionSummary) return null;
    return (
      <CurrentPlanContent
        summary={subscriptionSummary}
        pendingSwitch={pendingSwitch}
        onSwitchClick={() => setShowPlanPicker(true)}
        onCancelPending={() => revertPendingMutation.mutate({})}
        isCancelPending={revertPendingMutation.isPending}
      />
    );
  }

  return (
    <div className="mt-2 grid gap-3 lg:grid-cols-[1fr_1.5fr_1fr] lg:gap-5 xl:grid-cols-[1fr_2fr_1fr]">
      {showVerification && !emailVerified && (
        <div className="col-span-full">
          <EmailVerificationBanner onVerified={handleVerified} />
        </div>
      )}
      <FreePlanCard />
      <StandardPlanCards />
      <ProPlanCard />
    </div>
  );
}

function SubscriptionSummarySkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-[72px] w-full rounded-lg" />
      <div className="space-y-2">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-5 w-44" />
      </div>
    </div>
  );
}
