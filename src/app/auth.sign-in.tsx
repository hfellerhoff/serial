import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AuthHeader } from "~/components/auth/AuthHeader";
import { Button } from "~/components/ui/button";
import { CardContent } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { signIn } from "~/lib/auth-client";
import { orpc } from "~/lib/orpc";
import {
  AUTH_RESET_PASSWORD_URL,
  AUTH_SIGNED_IN_URL,
} from "../server/auth/constants";

const ERROR_MESSAGES = {
  INVALID_LOGIN: "Invalid email or password",
};

export const Route = createFileRoute("/auth/sign-in")({
  component: SignIn,
  loader: async () => {
    // const isForgotPasswordEnabled = await fetchIsForgotPasswordEnabled();
    return { isForgotPasswordEnabled: false };
  },
});

function SignIn() {
  const { isForgotPasswordEnabled } = Route.useLoaderData();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const { mutateAsync: getIsLegacyUser } = useMutation(
    orpc.user.checkIsLegacyUser.mutationOptions(),
  );

  return (
    <>
      <AuthHeader removePadding></AuthHeader>
      <CardContent>
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
                  onSuccess: async () => {
                    router.navigate({
                      to: AUTH_SIGNED_IN_URL,
                      reloadDocument: true,
                    });
                  },
                  onError: async (ctx) => {
                    const errorMessage =
                      ctx.error.message ?? "Something went wrong.";

                    if (errorMessage === ERROR_MESSAGES.INVALID_LOGIN) {
                      const isSuccessful = await getIsLegacyUser({
                        email,
                      });

                      if (isSuccessful) {
                        router.navigate({
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
            {loading ? <Loader2 size={16} className="animate-spin" /> : "Login"}
          </Button>
          <Link
            className="block text-center text-sm underline"
            to="/auth/sign-up"
          >
            Need an account? Sign up
          </Link>
        </div>
      </CardContent>
    </>
  );
}
