"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { AUTH_SIGNED_IN_URL } from "../server/auth/constants";
import { Button } from "~/components/ui/button";
import { CardContent } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { signUp } from "~/lib/auth-client";
import { AuthHeader } from "~/components/auth/AuthHeader";
import { orpcRouterClient } from "~/lib/orpc";

export const Route = createFileRoute("/auth/sign-up")({
  component: SignUp,
  loader: () => orpcRouterClient.admin.getIsPublicSignupEnabled(),
});

function SignUp() {
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const signupStatus = Route.useLoaderData();
  const signupsEnabled = signupStatus.enabled === true;

  if (!signupsEnabled) {
    return (
      <AuthHeader>
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-muted-foreground">
            Sign ups are currently disabled.
          </p>
          <Link to="/auth/sign-in">
            <Button variant="outline">Go to Sign In</Button>
          </Link>
        </div>
      </AuthHeader>
    );
  }

  return (
    <>
      <AuthHeader removePadding={!signupStatus.isFirstUser}>
        {signupStatus.isFirstUser && (
          <div className="text-center">
            <div className="text-center font-semibold">
              Admin Account Creation
            </div>
            <div className="text-muted-foreground mx-auto max-w-2xs pt-1">
              Welcome to Serial! Let&apos;s create your first account.
            </div>
          </div>
        )}
      </AuthHeader>
      <CardContent>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="first-name">First name</Label>
            <Input
              id="first-name"
              placeholder="Max"
              required
              onChange={(e) => {
                setFirstName(e.target.value);
              }}
              value={firstName}
            />
          </div>
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
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="Password"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Confirm Password</Label>
            <Input
              id="password_confirmation"
              type="password"
              value={passwordConfirmation}
              onChange={(e) => setPasswordConfirmation(e.target.value)}
              autoComplete="new-password"
              placeholder="Confirm Password"
            />
          </div>
        </div>
        <Button
          type="submit"
          className="mt-4 w-full"
          disabled={loading}
          onClick={async () => {
            await signUp.email({
              email,
              password,
              name: firstName,
              callbackURL: AUTH_SIGNED_IN_URL,
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
                  void router.navigate({
                    to: AUTH_SIGNED_IN_URL,
                    reloadDocument: true,
                  });
                },
              },
            });
          }}
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            "Create an account"
          )}
        </Button>
        <Link
          className="mt-4 block text-center text-sm underline"
          to="/auth/sign-in"
        >
          Have an account? Sign in
        </Link>
      </CardContent>
    </>
  );
}
