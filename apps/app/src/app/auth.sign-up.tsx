"use client";

import { createFileRoute, Link } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { AuthHeader } from "~/components/auth/AuthHeader";
import {
  AuthMethodList,
  getAuthMethodLabel,
  resolveAuthMethodView,
} from "~/components/auth/AuthMethodList";
import { Button } from "~/components/ui/button";
import { CardContent } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { signUp } from "~/lib/auth-client";
import { AUTH_SIGNED_IN_URL } from "~/lib/auth/constants";
import { useRedirectErrorToast } from "~/lib/auth/redirect-error";
import { authProviderSchema } from "~/lib/constants";
import { extensionConnectCallbackSchema } from "~/lib/extension-auth";
import { orpcRouterClient } from "~/lib/orpc";

const signUpSearchSchema = z.object({
  token: z.string().optional(),
  callbackURL: extensionConnectCallbackSchema.optional(),
  error: z.string().optional(),
  method: authProviderSchema.optional().catch(undefined),
});

export const Route = createFileRoute("/auth/sign-up")({
  component: SignUp,
  validateSearch: zodValidator(signUpSearchSchema),
  loaderDeps: ({ search }) => ({ token: search.token }),
  loader: ({ deps }) =>
    orpcRouterClient.admin.getSignupConfig({ token: deps.token }),
});

function SignUp() {
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const {
    token,
    callbackURL,
    error: redirectError,
    method,
  } = Route.useSearch();
  const signedInDestination = callbackURL ?? AUTH_SIGNED_IN_URL;

  const navigate = Route.useNavigate();
  useRedirectErrorToast(redirectError, navigate);

  const signupStatus = Route.useLoaderData();
  const signupsEnabled = signupStatus.enabled === true;

  // Configured-and-enabled: the loader already intersects enabled providers
  // with the instance's configured set, and invite-token sign-ups stay
  // email-only upstream.
  const view = resolveAuthMethodView({
    providers: signupStatus.signupProviders,
    isOAuthConfigured: signupStatus.isOAuthConfigured,
    method,
  });
  const hasContextHeader =
    signupStatus.isFirstUser || signupStatus.inviterName !== null;
  // Bootstrap (and invite) copy outranks the subscreen title: the
  // first-user context must survive drilling into a method.
  const subscreenTitle =
    view.openMethod && !hasContextHeader
      ? getAuthMethodLabel(
          "sign-up",
          view.openMethod,
          signupStatus.oauthProviderName,
        )
      : undefined;

  if (!signupsEnabled) {
    return (
      <AuthHeader>
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-muted-foreground">
            Sign ups are currently disabled.
          </p>
          {!signupStatus.isFirstUser && (
            <Link to="/auth/sign-in" search={{ callbackURL }}>
              <Button variant="outline" size="lg">
                Go to Sign In
              </Button>
            </Link>
          )}
        </div>
      </AuthHeader>
    );
  }

  const emailForm = (
    <>
      <div className="grid gap-2">
        <Label htmlFor="first-name">First name</Label>
        <Input
          className="h-10"
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
          className="h-10"
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
          className="h-10"
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          placeholder="Password"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password_confirmation">Confirm Password</Label>
        <Input
          className="h-10"
          id="password_confirmation"
          type="password"
          value={passwordConfirmation}
          onChange={(e) => setPasswordConfirmation(e.target.value)}
          autoComplete="new-password"
          placeholder="Confirm Password"
        />
      </div>
      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={loading}
        onClick={async () => {
          await signUp.email({
            email,
            password,
            name: firstName,
            callbackURL: signedInDestination,
            ...(token ? { invitationToken: token } : {}),
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
                window.location.assign(signedInDestination);
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
    </>
  );

  return (
    <>
      <AuthHeader removePadding={!hasContextHeader && !subscreenTitle}>
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
        {!signupStatus.isFirstUser && signupStatus.inviterName && (
          <div className="text-center">
            <div className="text-center font-semibold">Welcome!</div>
            <div className="text-muted-foreground mx-auto max-w-2xs pt-1">
              {signupStatus.inviterName} has invited you to Serial.
            </div>
          </div>
        )}
        {subscreenTitle && (
          <div className="text-center font-semibold">{subscreenTitle}</div>
        )}
      </AuthHeader>
      <CardContent>
        <AuthMethodList
          intent="sign-up"
          view={view}
          oauthProviderId={signupStatus.oauthProviderId}
          oauthProviderName={signupStatus.oauthProviderName}
          signedInDestination={signedInDestination}
          disabled={loading}
          emailForm={emailForm}
          footer={
            !signupStatus.isFirstUser && (
              <Link
                className="block text-center text-sm underline"
                to="/auth/sign-in"
                search={{ callbackURL, method: view.openMethod }}
              >
                Have an account? Sign in
              </Link>
            )
          }
          onOpenMethod={(openedMethod) =>
            void navigate({
              search: (prev) => ({ ...prev, method: openedMethod }),
            })
          }
          onBack={() =>
            void navigate({
              search: (prev) => ({ ...prev, method: undefined }),
            })
          }
        />
      </CardContent>
    </>
  );
}
