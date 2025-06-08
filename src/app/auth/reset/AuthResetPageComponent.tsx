"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type PropsWithChildren, useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardFooter } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { authClient } from "~/lib/auth-client";
import {
  AUTH_PAGE_URL,
  AUTH_RESET_PASSWORD_URL,
  AUTH_SIGNED_OUT_URL,
} from "~/server/auth/constants";
import { AuthHeader } from "../AuthHeader";

function AlertPane({
  title,
  description,
  hideButton,
}: {
  title: string;
  description: string;
  hideButton?: boolean;
}) {
  return (
    <>
      <div className="absolute top-6 left-6">
        <Link href={AUTH_SIGNED_OUT_URL}>
          <Button variant="outline">⭠ Back to Home</Button>
        </Link>
      </div>
      <div className="grid h-screen w-screen place-items-center p-4">
        <Card className="w-full max-w-md">
          <AuthHeader>
            <p className="text-center font-semibold">{title}</p>
            <p className="mx-auto max-w-xs text-center">{description}</p>
            {!hideButton && (
              <CardFooter className="mt-4 w-full">
                <Link href={AUTH_PAGE_URL} className="w-full">
                  <Button className="w-full">Back to Sign In</Button>
                </Link>
              </CardFooter>
            )}
          </AuthHeader>
        </Card>
      </div>
    </>
  );
}

function InputPane({
  title,
  children,
}: PropsWithChildren<{
  title: string;
}>) {
  return (
    <>
      <div className="absolute top-6 left-6">
        <Link href={AUTH_SIGNED_OUT_URL}>
          <Button variant="outline">⭠ Back to Home</Button>
        </Link>
      </div>
      <div className="grid h-screen w-screen place-items-center p-4">
        <Card className="w-full max-w-md">
          <AuthHeader>
            <p className="text-center font-semibold">{title}</p>
          </AuthHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </div>
    </>
  );
}

export function AuthResetPageComponent() {
  const params = useSearchParams();

  const token = params.get("token") ?? "";

  const [email, setEmail] = useState(params.get("email") ?? "");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);

  if (!!token && isSent) {
    return (
      <AlertPane
        title="Reset Password"
        description="Success! Your password as been reset."
      />
    );
  }

  if (!token && isSent) {
    return (
      <AlertPane
        title="Reset Password"
        description="Success! Check your email for your password reset email."
        hideButton
      />
    );
  }

  if (!!token && !isSent) {
    return (
      <InputPane title="Reset Password">
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="************"
              autoComplete="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={loading}
            onClick={async () => {
              await authClient.resetPassword({
                token,
                newPassword: password,
                fetchOptions: {
                  onResponse: () => {
                    setLoading(false);
                  },
                  onRequest: () => {
                    setLoading(true);
                  },
                  onError: (ctx) => {
                    toast.error(ctx.error.message ?? "Something went wrong.");
                  },
                  onSuccess: async () => {
                    setIsSent(true);
                  },
                },
              });
            }}
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              "Submit"
            )}
          </Button>
        </div>
      </InputPane>
    );
  }

  return (
    <InputPane title="Reset Password">
      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="email@example.com"
            required
            onChange={(e) => {
              setEmail(e.target.value);
            }}
            value={email}
          />
        </div>
        <Button
          type="submit"
          className="w-full"
          disabled={loading}
          onClick={async () => {
            await authClient.forgetPassword({
              email,
              redirectTo: AUTH_RESET_PASSWORD_URL,
              fetchOptions: {
                onResponse: () => {
                  setLoading(false);
                },
                onRequest: () => {
                  setLoading(true);
                },
                onError: (ctx) => {
                  toast.error(ctx.error.message ?? "Something went wrong.");
                },
                onSuccess: async () => {
                  setIsSent(true);
                },
              },
            });
          }}
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            "Send Reset Email"
          )}
        </Button>
      </div>
    </InputPane>
  );
}
