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
import { z } from "zod";
import { AuthHeader } from "~/components/auth/AuthHeader";
import { AuthMethodList } from "~/components/auth/AuthMethodList";
import {
  getAuthMethodLabel,
  resolveAuthMethodView,
} from "~/lib/auth/method-view";
import { Button } from "~/components/ui/button";
import { CardContent } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { signIn } from "~/lib/auth-client";
import {
  AUTH_RESET_PASSWORD_URL,
  AUTH_SIGNED_IN_URL,
} from "~/lib/auth/constants";
import { useRedirectErrorToast } from "~/lib/auth/redirect-error";
import { authProviderSchema } from "~/lib/constants";
import { extensionConnectCallbackSchema } from "~/lib/extension-auth";
import { orpc, orpcRouterClient } from "~/lib/orpc";
import { fetchIsForgotPasswordEnabled } from "~/server/auth/endpoints";

const ERROR_MESSAGES = {
  INVALID_LOGIN: "Invalid email or password",
};

const signInSearchSchema = z.object({
  callbackURL: extensionConnectCallbackSchema.optional(),
  error: z.string().optional(),
  method: authProviderSchema.optional().catch(undefined),
});

export const Route = createFileRoute("/auth/sign-in")({
  component: SignIn,
  validateSearch: signInSearchSchema,
  // Deliberately empty: the loader's data depends on no search param, and
  // listing params here folds them into the match id — every ?method=
  // subscreen toggle would then re-run both server calls. The first-user
  // redirect below reads the live search from `location` instead.
  loaderDeps: () => ({}),
  loader: async ({ location }) => {
    const [isForgotPasswordEnabled, authConfig] = await Promise.all([
      fetchIsForgotPasswordEnabled(),
      orpcRouterClient.admin.getSigninConfig(),
    ]);
    if (authConfig.isFirstUser) {
      // Forward the callback error too: a failed atproto flow during
      // first-user bootstrap lands here and must still surface its toast
      // (and reopen its subscreen via `method`).
      const search = signInSearchSchema.parse(location.search);
      throw redirect({
        to: "/auth/sign-up",
        search: {
          callbackURL: search.callbackURL,
          error: search.error,
          method: search.method,
        },
      });
    }
    return { isForgotPasswordEnabled, authConfig };
  },
});

function SignIn() {
  const { isForgotPasswordEnabled, authConfig } = Route.useLoaderData();
  const { callbackURL, error: redirectError, method } = Route.useSearch();
  const signedInDestination = callbackURL ?? AUTH_SIGNED_IN_URL;

  const navigate = Route.useNavigate();
  useRedirectErrorToast(redirectError, navigate);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const { mutateAsync: getIsLegacyUser } = useMutation(
    orpc.user.checkIsLegacyUser.mutationOptions(),
  );

  // Configured-and-enabled: the loader already intersects enabled providers
  // with the instance's configured set.
  const view = resolveAuthMethodView({
    providers: authConfig.signinProviders,
    isOAuthConfigured: authConfig.isOAuthConfigured,
    method,
  });
  const subscreenTitle = view.openMethod
    ? getAuthMethodLabel(
        "sign-in",
        view.openMethod,
        authConfig.oauthProviderName,
      )
    : undefined;

  const emailForm = (
    <>
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
          className="h-10"
          id="password"
          type="password"
          placeholder="password"
          autoComplete="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <Button
        size="lg"
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
        {loading ? <Loader2 size={16} className="animate-spin" /> : "Login"}
      </Button>
    </>
  );

  return (
    <>
      <AuthHeader removePadding={!subscreenTitle}>
        {subscreenTitle && (
          <div className="text-center font-semibold">{subscreenTitle}</div>
        )}
      </AuthHeader>
      <CardContent>
        <AuthMethodList
          intent="sign-in"
          view={view}
          oauthProviderId={authConfig.oauthProviderId}
          oauthProviderName={authConfig.oauthProviderName}
          signedInDestination={signedInDestination}
          disabled={loading}
          emailForm={emailForm}
          footer={
            authConfig.signupEnabled && (
              <Link
                className="block text-center text-sm underline"
                to="/auth/sign-up"
                search={{ callbackURL, method: view.openMethod }}
              >
                Need an account? Sign up
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
