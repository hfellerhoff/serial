"use client";

import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AUTH_SIGNED_IN_URL } from "~/server/auth/constants";
import { AuthHeader } from "~/components/auth/AuthHeader";
import { Button } from "~/components/ui/button";
import { CardContent } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { authClient, useSession } from "~/lib/auth-client";
import { orpc } from "~/lib/orpc";

export const Route = createFileRoute("/auth/verify-email")({
  component: VerifyEmail,
});

function VerifyEmail() {
  const { data: session } = useSession();
  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const hasSentRef = useRef(false);

  const isCooldownActive = cooldownRemaining > 0;
  const email = session?.user?.email;

  // Countdown timer
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
        if (result.sent) {
          toast.success("Verification code sent to your email");
        }
      },
      onError: (error) => {
        toast.error(error.message ?? "Failed to send verification code");
      },
    }),
  );

  // Auto-send on page load
  useEffect(() => {
    if (hasSentRef.current) return;
    hasSentRef.current = true;
    sendMutation.mutate(undefined);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    window.location.assign(AUTH_SIGNED_IN_URL);
  }

  const inputRef = useCallback((node: HTMLInputElement | null) => {
    node?.focus();
  }, []);

  const codeSent = sendMutation.isSuccess || sendMutation.isError;

  return (
    <>
      <AuthHeader>
        <div className="text-center">
          <div className="text-center font-semibold">Verify your email</div>
          <div className="text-muted-foreground mx-auto max-w-2xs pt-1">
            A verification code will be sent to {email}.
          </div>
        </div>
      </AuthHeader>
      <CardContent>
        <div className="grid gap-4">
          {!codeSent ? (
            <Button className="w-full" disabled>
              Sending verification code...
            </Button>
          ) : (
            <>
              <div className="flex gap-2">
                <Input
                  ref={inputRef}
                  type="text"
                  inputMode="numeric"
                  placeholder="Enter code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                />
                <Button
                  disabled={verifying || otp.length === 0}
                  onClick={handleVerify}
                >
                  {verifying ? "Verifying..." : "Verify"}
                </Button>
              </div>
              <Button
                variant="ghost"
                className="text-muted-foreground text-sm"
                disabled={sendMutation.isPending || isCooldownActive}
                onClick={() => sendMutation.mutate(undefined)}
              >
                {isCooldownActive
                  ? `Resend code (${cooldownRemaining}s)`
                  : "Resend code"}
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </>
  );
}
