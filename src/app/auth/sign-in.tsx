"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { CardContent } from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { signIn } from "~/lib/auth-client";
import { useTRPC } from "~/trpc/react";
import {
  AUTH_RESET_PASSWORD_URL,
  AUTH_SIGNED_IN_URL,
} from "../../server/auth/constants";

const ERROR_MESSAGES = {
  INVALID_LOGIN: "Invalid email or password",
};

export default function SignIn({
  isForgotPasswordEnabled,
}: {
  isForgotPasswordEnabled: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const router = useRouter();

  const trpc = useTRPC();
  const { mutateAsync: getIsLegacyUser } = useMutation(
    trpc.user.checkIsLegacyUser.mutationOptions(),
  );

  return (
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
                href={`${AUTH_RESET_PASSWORD_URL}?email=${encodeURIComponent(email)}`}
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
        <div className="flex items-center gap-2">
          <Checkbox
            id="remember"
            onClick={() => {
              setRememberMe(!rememberMe);
            }}
          />
          <Label htmlFor="remember">Remember me</Label>
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={loading}
          onClick={async () => {
            await signIn.email(
              {
                email,
                password,
              },
              {
                onRequest: (ctx) => {
                  setLoading(true);
                },
                onResponse: (ctx) => {
                  setLoading(false);
                },
                onSuccess: async () => {
                  router.push(AUTH_SIGNED_IN_URL);
                },
                onError: async (ctx) => {
                  const errorMessage =
                    ctx.error.message ?? "Something went wrong.";

                  if (errorMessage === ERROR_MESSAGES.INVALID_LOGIN) {
                    const isSuccessful = await getIsLegacyUser({
                      email,
                    });

                    if (isSuccessful) {
                      router.push(
                        `${AUTH_RESET_PASSWORD_URL}?email=${encodeURIComponent(email)}`,
                      );
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
      </div>
    </CardContent>
  );
}
