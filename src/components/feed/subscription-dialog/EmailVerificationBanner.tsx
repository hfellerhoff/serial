"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { authClient, useSession } from "~/lib/auth-client";

const OTP_COOLDOWN_SECONDS = 60;

export function EmailVerificationBanner({
  onVerified,
}: {
  onVerified: () => void;
}) {
  const { data: session } = useSession();
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  const isCooldownActive = cooldownRemaining > 0;

  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const timer = setTimeout(() => {
      setCooldownRemaining((prev) => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [cooldownRemaining]);

  const startCooldown = useCallback(() => {
    setCooldownRemaining(OTP_COOLDOWN_SECONDS);
  }, []);

  const email = session?.user?.email;

  async function handleSendOtp() {
    if (!email || isCooldownActive) return;
    setSending(true);
    try {
      await authClient.emailOtp.sendVerificationOtp({
        email,
        type: "email-verification",
      });
      setOtpSent(true);
      startCooldown();
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
          disabled={sending || isCooldownActive}
          onClick={handleSendOtp}
        >
          {sending ? "Sending..." : "Send verification code"}
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
            disabled={sending || isCooldownActive}
            onClick={handleSendOtp}
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
