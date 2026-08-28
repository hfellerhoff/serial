import { useMutation } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  redirect,
  useRouter,
} from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { AuthHeader } from "~/components/auth/AuthHeader";
import { Button } from "~/components/ui/button";
import { CardContent } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { authClient, signIn } from "~/lib/auth-client";
import {
  AUTH_RESET_PASSWORD_URL,
  AUTH_SIGNED_IN_URL,
} from "~/lib/auth/constants";
import { extensionConnectCallbackSchema } from "~/lib/extension-auth";
import { orpc, orpcRouterClient } from "~/lib/orpc";
import { fetchIsForgotPasswordEnabled } from "~/server/auth/endpoints";

const ERROR_MESSAGES = {
  INVALID_LOGIN: "Invalid email or password",
};

/** Messages for the ?error= param the OAuth-style callbacks redirect with. */
const REDIRECT_ERROR_MESSAGES: Record<string, string> = {
  atproto: "Atmosphere sign-in failed. Please try again.",
};

const signInSearchSchema = z.object({
  callbackURL: extensionConnectCallbackSchema.optional(),
  error: z.string().optional(),
});

export const Route = createFileRoute("/auth/sign-in")({
  component: SignIn,
  validateSearch: signInSearchSchema,
  loaderDeps: ({ search }) => ({ callbackURL: search.callbackURL }),
  loader: async ({ deps }) => {
    const [isForgotPasswordEnabled, authConfig] = await Promise.all([
      fetchIsForgotPasswordEnabled(),
      orpcRouterClient.admin.getSigninConfig(),
    ]);
    if (authConfig.isFirstUser) {
      throw redirect({
        to: "/auth/sign-up",
        search: { callbackURL: deps.callbackURL },
      });
    }
    return { isForgotPasswordEnabled, authConfig };
  },
});

function SignIn() {
  const { isForgotPasswordEnabled, authConfig } = Route.useLoaderData();
  const { callbackURL, error: redirectError } = Route.useSearch();
  const signedInDestination = callbackURL ?? AUTH_SIGNED_IN_URL;

  // Surface a callback failure once, then drop the param from the URL so a
  // refresh doesn't re-toast (same shape as the checkout_success handling).
  const hasProcessedRedirectError = useRef(false);
  useEffect(() => {
    if (!redirectError || hasProcessedRedirectError.current) return;
    hasProcessedRedirectError.current = true;
    toast.error(
      REDIRECT_ERROR_MESSAGES[redirectError] ??
        "Sign-in failed. Please try again.",
    );
    const params = new URLSearchParams(window.location.search);
    params.delete("error");
    window.history.replaceState(
      {},
      "",
      window.location.pathname + (params.size > 0 ? `?${params}` : ""),
    );
  }, [redirectError]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const { mutateAsync: getIsLegacyUser } = useMutation(
    orpc.user.checkIsLegacyUser.mutationOptions(),
  );

  const showEmail = authConfig.signinProviders.includes("email");
  const showOAuth =
    authConfig.isOAuthConfigured &&
    authConfig.signinProviders.includes("oauth");

  return (
    <>
      <AuthHeader removePadding></AuthHeader>
      <CardContent>
        <div className="grid gap-4">
          {showEmail && (
            <>
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
                <div className="flex items-center">
                  <Label htmlFor="password">Password</Label>
                  {isForgotPasswordEnabled && (
                    <Link
                      to={AUTH_RESET_PASSWORD_URL}
                      search={{
                        email,
                        callbackURL,
                      }}
                      className="ml-auto inline-block text-sm underline"
                    >
                      Forgot your password?
                    </Link>
                  )}
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="password"
                  autoComplete="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button
                className="w-full"
                disabled={loading}
                onClick={async () => {
                  await signIn.email(
                    {
                      email,
                      password,
                      callbackURL: signedInDestination,
                    },
                    {
                      onRequest: () => {
                        setLoading(true);
                      },
                      onResponse: () => {
                        setLoading(false);
                      },
                      onSuccess: (ctx) => {
                        if (ctx.data?.redirect) return;
                        window.location.assign(signedInDestination);
                      },
                      onError: async (ctx) => {
                        const errorMessage = ctx.error.message;

                        if (errorMessage === ERROR_MESSAGES.INVALID_LOGIN) {
                          const isSuccessful = await getIsLegacyUser({
                            email,
                          });

                          if (isSuccessful) {
                            void router.navigate({
                              to: AUTH_RESET_PASSWORD_URL,
                              search: { email, callbackURL },
                            });
                          }
                          return;
                        }

                        toast.error(errorMessage);
                      },
                    },
                  );
                }}
              >
                {loading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  "Login"
                )}
              </Button>
            </>
          )}

          {showEmail && showOAuth && (
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card text-muted-foreground px-2">or</span>
              </div>
            </div>
          )}

          {showOAuth && (
            <Button
              variant={showEmail ? "outline" : "default"}
              className="w-full"
              disabled={loading}
              onClick={async () => {
                setLoading(true);
                await authClient.signIn.oauth2({
                  providerId: authConfig.oauthProviderId,
                  callbackURL: signedInDestination,
                });
              }}
            >
              {loading && !showEmail ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                `Sign in with ${authConfig.oauthProviderName}`
              )}
            </Button>
          )}

          {authConfig.signupEnabled && (
            <Link
              className="block text-center text-sm underline"
              to="/auth/sign-up"
              search={{ callbackURL }}
            >
              Need an account? Sign up
            </Link>
          )}
        </div>
      </CardContent>
    </>
  );
}
