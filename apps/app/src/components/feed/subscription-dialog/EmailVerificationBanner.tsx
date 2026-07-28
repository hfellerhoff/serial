"use client";

import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { authClient, useSession } from "~/lib/auth-client";
import { orpc } from "~/lib/orpc";

export function EmailVerificationBanner({
  onVerified,
}: {
  onVerified: () => void;
}) {
  const { data: session } = useSession();
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  const isCooldownActive = cooldownRemaining > 0;
  const email = session?.user?.email;

  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const timer = setTimeout(() => {
      setCooldownRemaining((prev) => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [cooldownRemaining]);

  const sendMutation = useMutation(
    orpc.user.requestVerificationCode.mutationOptions({
      onSuccess: (result) => {
        setCooldownRemaining(result.retryAfter);
        setOtpSent(true);
        if (result.sent) {
          toast.success("Verification code sent to your email");
        }
      },
      onError: (error) => {
        toast.error(error.message ?? "Failed to send verification code");
      },
    }),
  );

  async function handleVerify() {
    if (!email || !otp) return;
    setVerifying(true);
    const { error } = await authClient.emailOtp.verifyEmail({
      email,
      otp,
    });
    setVerifying(false);

    if (error) {
      toast.error(error.message ?? "Invalid verification code");
      return;
    }

    toast.success("Email verified!");
    onVerified();
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
          disabled={sendMutation.isPending || isCooldownActive}
          onClick={() => sendMutation.mutate(undefined)}
        >
          {sendMutation.isPending ? "Sending..." : "Send verification code"}
        </Button>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex gap-2">
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
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground w-fit text-xs"
            disabled={sendMutation.isPending || isCooldownActive}
            onClick={() => sendMutation.mutate(undefined)}
          >
            {isCooldownActive
              ? `Resend code (${cooldownRemaining}s)`
              : "Resend code"}
          </Button>
        </div>
      )}
    </div>
  );
}
