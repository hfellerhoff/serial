import { useMutation } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  redirect,
  useRouter,
} from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  AUTH_RESET_PASSWORD_URL,
  AUTH_SIGNED_IN_URL,
} from "../server/auth/constants";
import { fetchIsForgotPasswordEnabled } from "~/server/auth/endpoints";
import { AuthHeader } from "~/components/auth/AuthHeader";
import { Button } from "~/components/ui/button";
import { CardContent } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { authClient, signIn } from "~/lib/auth-client";
import { orpc, orpcRouterClient } from "~/lib/orpc";

const ERROR_MESSAGES = {
  INVALID_LOGIN: "Invalid email or password",
};

export const Route = createFileRoute("/auth/sign-in")({
  component: SignIn,
  loader: async () => {
    const [isForgotPasswordEnabled, authConfig] = await Promise.all([
      fetchIsForgotPasswordEnabled(),
      orpcRouterClient.admin.getSigninConfig(),
    ]);
    if (authConfig.isFirstUser) {
      throw redirect({ to: "/auth/sign-up" });
    }
    return { isForgotPasswordEnabled, authConfig };
  },
});

function SignIn() {
  const { isForgotPasswordEnabled, authConfig } = Route.useLoaderData();

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
                    },
                    {
                      onRequest: () => {
                        setLoading(true);
                      },
                      onResponse: () => {
                        setLoading(false);
                      },
                      onSuccess: () => {
                        void router.navigate({
                          to: AUTH_SIGNED_IN_URL,
                          reloadDocument: true,
                        });
                      },
                      onError: async (ctx) => {
                        const errorMessage = ctx.error.message;

                        if (errorMessage === ERROR_MESSAGES.INVALID_LOGIN) {
                          const isSuccessful = await getIsLegacyUser({
                            email,
                          });

                          if (isSuccessful) {
                            void router.navigate({
                              to: `${AUTH_RESET_PASSWORD_URL}?email=${encodeURIComponent(email)}`,
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
                  callbackURL: AUTH_SIGNED_IN_URL,
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
            >
              Need an account? Sign up
            </Link>
          )}
        </div>
      </CardContent>
    </>
  );
}
