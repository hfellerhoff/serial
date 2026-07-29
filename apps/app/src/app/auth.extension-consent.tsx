import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { AuthHeader } from "~/components/auth/AuthHeader";
import { Button } from "~/components/ui/button";
import { CardContent } from "~/components/ui/card";
import { authClient } from "~/lib/auth-client";

export const Route = createFileRoute("/auth/extension-consent")({
  validateSearch: z.object({
    client_id: z.string().optional(),
    scope: z.string().optional(),
    oauth_query: z.string().optional(),
  }),
  component: ExtensionConsent,
});

function ExtensionConsent() {
  const { client_id: clientId, scope } = Route.useSearch();
  const [loading, setLoading] = useState<"accept" | "deny" | null>(null);

  async function respond(accept: boolean) {
    setLoading(accept ? "accept" : "deny");
    await authClient.oauth2.consent({
      accept,
      scope,
    });
    setLoading(null);
  }

  return (
    <>
      <AuthHeader removePadding />
      <CardContent className="grid gap-5 pb-6">
        <div className="grid gap-2 text-center">
          <h1 className="text-xl font-semibold">Connect to Serial</h1>
          <p className="text-muted-foreground text-sm">
            {clientId === SERIAL_EXTENSION_CLIENT_ID
              ? "Allow the Serial browser extension to access this account."
              : "Allow this application to access your Serial account."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            className="flex-1"
            variant="outline"
            disabled={loading !== null}
            onClick={() => void respond(false)}
          >
            {loading === "deny" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              "Deny"
            )}
          </Button>
          <Button
            className="flex-1"
            disabled={loading !== null}
            onClick={() => void respond(true)}
          >
            {loading === "accept" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              "Allow"
            )}
          </Button>
        </div>
      </CardContent>
    </>
  );
}

const SERIAL_EXTENSION_CLIENT_ID = "serial-browser-extension";
