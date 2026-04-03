"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckIcon } from "lucide-react";
import { toast } from "sonner";
import type { PlanConfig } from "~/server/subscriptions/plans";
import { PLAN_IDS, PLANS } from "~/server/subscriptions/plans";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { ControlledResponsiveDialog } from "~/components/ui/responsive-dropdown";
import { useSubscription } from "~/lib/data/subscription";
import { orpc } from "~/lib/orpc";
import { authClient, useSession } from "~/lib/auth-client";

function formatPrice(cents: number): string {
  const dollars = cents / 100;
  return cents % 100 === 0 ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

function formatRefreshInterval(ms: number | null): string {
  if (ms == null) return "Manual refresh only";
  const minutes = ms / (60 * 1000);
  if (minutes < 60) return `Background refresh every ${minutes} min`;
  const hours = minutes / 60;
  return `Background refresh every ${hours} hr`;
}

function getPlanFeatures(plan: PlanConfig): string[] {
  const features: string[] = [];
  features.push(`Up to ${plan.maxActiveFeeds.toLocaleString()} active feeds`);
  features.push(formatRefreshInterval(plan.backgroundRefreshIntervalMs));

  return features;
}

function EmailVerificationBanner({ onVerified }: { onVerified: () => void }) {
  const { data: session } = useSession();
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const email = session?.user?.email;

  async function handleSendOtp() {
    if (!email) return;
    setSending(true);
    try {
      await authClient.emailOtp.sendVerificationOtp({
        email,
        type: "email-verification",
      });
      setOtpSent(true);
      toast.success("Verification code sent to your email");
    } catch {
      toast.error("Failed to send verification code");
    } finally {
      setSending(false);
    }
  }

  async function handleVerify() {
    if (!email || !otp) return;
    setVerifying(true);
    try {
      await authClient.emailOtp.verifyEmail({
        email,
        otp,
      });
      toast.success("Email verified!");
      onVerified();
    } catch {
      toast.error("Invalid verification code");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-3">
      <p className="text-sm font-medium">Verify your email to subscribe</p>
      <p className="text-muted-foreground mt-1 text-xs">
        You need to verify your email address before upgrading your plan.
      </p>
      {!otpSent ? (
        <Button
          size="sm"
          variant="outline"
          className="mt-2"
          disabled={sending}
          onClick={handleSendOtp}
        >
          {sending ? "Sending..." : "Send verification code"}
        </Button>
      ) : (
        <div className="mt-2 flex gap-2">
          <Input
            type="text"
            inputMode="numeric"
            placeholder="Enter code"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            className="h-8 w-32"
          />
          <Button
            size="sm"
            disabled={verifying || otp.length === 0}
            onClick={handleVerify}
          >
            {verifying ? "Verifying..." : "Verify"}
          </Button>
        </div>
      )}
    </div>
  );
}

export function SubscriptionDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { planId } = useSubscription();
  const { data: session, refetch: refetchSession } = useSession();
  const [showVerification, setShowVerification] = useState(false);
  const [pendingPlanId, setPendingPlanId] = useState<"standard" | "pro" | null>(
    null,
  );

  const emailVerified = session?.user?.emailVerified ?? false;

  const { data: products } = useQuery({
    ...orpc.subscription.getProducts.queryOptions(),
    enabled: open,
    staleTime: 5 * 60 * 1000,
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

  const portalMutation = useMutation(
    orpc.subscription.createPortalSession.mutationOptions({
      onSuccess: (result) => {
        if (result.url) {
          window.location.assign(result.url);
        }
      },
    }),
  );

  const isSubscribed = planId !== "free";

  function handleSubscribeClick(id: "standard" | "pro") {
    setPendingPlanId(id);
    checkoutMutation.mutate({ planId: id });
  }

  async function handleVerified() {
    await refetchSession();
    setShowVerification(false);
    if (pendingPlanId) {
      checkoutMutation.mutate({ planId: pendingPlanId });
    }
  }

  return (
    <ControlledResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Subscription"
      description="Choose a plan that fits your needs."
    >
      <div className="grid gap-3">
        {showVerification && !emailVerified && (
          <EmailVerificationBanner onVerified={handleVerified} />
        )}
        {PLAN_IDS.map((id) => {
          const plan = PLANS[id];
          const isCurrent = id === planId;
          const isPaid = id !== "free";
          const product = products?.find((p) => p.planId === id);
          const monthlyPrice = product?.monthlyPrice ?? null;
          const annualPrice = product?.annualPrice ?? null;
          const hasPrice = monthlyPrice != null || annualPrice != null;
          const features = getPlanFeatures(plan);

          return (
            <div
              key={id}
              className={`rounded-lg border p-4 ${
                isCurrent ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <div>
                <h3 className="font-medium">
                  {plan.name}
                  {isCurrent && (
                    <span className="text-muted-foreground ml-2 text-xs">
                      Current
                    </span>
                  )}
                </h3>
                {hasPrice ? (
                  <p className="text-muted-foreground text-sm">
                    {monthlyPrice != null && `${formatPrice(monthlyPrice)}/mo`}
                    {monthlyPrice != null && annualPrice != null && " · "}
                    {annualPrice != null && `${formatPrice(annualPrice)}/yr`}
                  </p>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    {isPaid ? "" : "Free"}
                  </p>
                )}
              </div>
              <ul className="mt-2 space-y-1">
                {features.map((feature) => (
                  <li
                    key={feature}
                    className="text-muted-foreground flex items-center gap-2 text-xs"
                  >
                    <CheckIcon size={12} />
                    {feature}
                  </li>
                ))}
              </ul>
              {isCurrent && isSubscribed && (
                <div className="mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={portalMutation.isPending}
                    onClick={() => portalMutation.mutate({})}
                  >
                    Manage
                  </Button>
                </div>
              )}
              {!isCurrent && id !== "free" && (
                <div className="mt-3">
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={checkoutMutation.isPending}
                    onClick={() => handleSubscribeClick(id)}
                  >
                    Subscribe
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ControlledResponsiveDialog>
  );
}
