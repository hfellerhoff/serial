"use client";

import { Link, useSearch } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AuthHeader } from "../AuthHeader";
import type { PropsWithChildren } from "react";
import { Button } from "~/components/ui/button";
import { CardContent, CardFooter } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { authClient } from "~/lib/auth-client";
import {
  AUTH_PAGE_URL,
  AUTH_RESET_PASSWORD_URL,
} from "~/server/auth/constants";

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
      <AuthHeader>
        <p className="text-center font-semibold">{title}</p>
        <p className="mx-auto max-w-xs text-center">{description}</p>
        {!hideButton && (
          <CardFooter className="mt-4 w-full">
            <Link to={AUTH_PAGE_URL} className="w-full">
              <Button className="w-full">Back to Sign In</Button>
            </Link>
          </CardFooter>
        )}
      </AuthHeader>
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
      <AuthHeader>
        <p className="text-center font-semibold">{title}</p>
      </AuthHeader>
      <CardContent>{children}</CardContent>
    </>
  );
}

export function AuthResetPageComponent() {
  const searchParams = useSearch({ from: "/auth/reset" });

  const [email, setEmail] = useState(searchParams.email);
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);

  if (!!searchParams.token && isSent) {
    return (
      <AlertPane
        title="Reset Password"
        description="Success! Your password as been reset."
      />
    );
  }

  if (!searchParams.token && isSent) {
    return (
      <AlertPane
        title="Reset Password"
        description="Success! Check your email for your password reset email."
        hideButton
      />
    );
  }

  if (!!searchParams.token && !isSent) {
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
                token: searchParams.token,
                newPassword: password,
                fetchOptions: {
                  onResponse: () => {
                    setLoading(false);
                  },
                  onRequest: () => {
                    setLoading(true);
                  },
                  onError: (ctx) => {
                    toast.error(ctx.error.message);
                  },
                  onSuccess: () => {
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
            await authClient.requestPasswordReset({
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
                  toast.error(ctx.error.message);
                },
                onSuccess: () => {
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
