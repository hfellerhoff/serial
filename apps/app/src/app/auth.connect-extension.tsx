import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { AuthHeader } from "~/components/auth/AuthHeader";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { CardContent } from "~/components/ui/card";
import { useSession } from "~/lib/auth-client";

const connectSearchSchema = z.object({
  redirect_uri: z.string(),
  state: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  code_challenge_method: z.literal("S256"),
});

const ACTION_TEXT = {
  approve: "Connect extension",
  deny: "Cancel",
} as const;

export const Route = createFileRoute("/auth/connect-extension")({
  validateSearch: connectSearchSchema,
  component: ConnectExtension,
});

function ConnectExtension() {
  const search = Route.useSearch();
  const { data: session, isPending } = useSession();
  const [action, setAction] = useState<keyof typeof ACTION_TEXT | null>(null);
  const [error, setError] = useState<string | null>(null);

  const callbackUrl = `/auth/connect-extension?${new URLSearchParams({
    redirect_uri: search.redirect_uri,
    state: search.state,
    code_challenge: search.code_challenge,
    code_challenge_method: search.code_challenge_method,
  }).toString()}`;
  const signInUrl = `/auth/sign-in?${new URLSearchParams({ callbackURL: callbackUrl }).toString()}`;

  async function respond(nextAction: keyof typeof ACTION_TEXT) {
    setAction(nextAction);
    setError(null);
    try {
      const response = await fetch("/api/extension-auth/approve", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: nextAction,
          redirectUri: search.redirect_uri,
          state: search.state,
          codeChallenge: search.code_challenge,
        }),
      });
      const payload = (await response.json()) as {
        redirectUrl?: unknown;
        error?: unknown;
      };
      if (!response.ok || typeof payload.redirectUrl !== "string") {
        throw new Error(
          typeof payload.error === "string"
            ? payload.error
            : "Unable to connect the extension",
        );
      }
      window.location.assign(payload.redirectUrl);
    } catch (responseError) {
      setError(
        responseError instanceof Error
          ? responseError.message
          : "Unable to connect the extension",
      );
      setAction(null);
    }
  }

  return (
    <>
      <AuthHeader removePadding />
      <CardContent className="grid gap-5 pb-6">
        <div className="grid gap-2 text-center">
          <h1 className="text-xl font-semibold">
            Connect the Serial extension
          </h1>
          <p className="text-muted-foreground text-sm">
            The extension will be able to access this Serial account until you
            disconnect it or the connection expires.
          </p>
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {isPending ? (
          <Loader2 className="mx-auto size-5 animate-spin" />
        ) : session ? (
          <div className="flex gap-2">
            <Button
              className="flex-1"
              variant="outline"
              disabled={action !== null}
              onClick={() => void respond("deny")}
            >
              {action === "deny" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                ACTION_TEXT.deny
              )}
            </Button>
            <Button
              className="flex-1"
              disabled={action !== null}
              onClick={() => void respond("approve")}
            >
              {action === "approve" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                ACTION_TEXT.approve
              )}
            </Button>
          </div>
        ) : (
          <Button asChild>
            <a href={signInUrl}>Sign in to continue</a>
          </Button>
        )}
      </CardContent>
    </>
  );
}
