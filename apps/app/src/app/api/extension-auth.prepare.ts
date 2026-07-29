import { createFileRoute } from "@tanstack/react-router";
import { count } from "drizzle-orm";
import {
  ensureExtensionOAuthClient,
  SERIAL_EXTENSION_AUTH_SCOPES,
  SERIAL_EXTENSION_CLIENT_ID,
} from "~/server/auth/extension";
import { db } from "~/server/db";
import { user } from "~/server/db/schema";
import { env } from "~/env";

function corsResponse(body: BodyInit | null, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Cache-Control", "no-store");
  return new Response(body, { ...init, headers });
}

export const Route = createFileRoute("/api/extension-auth/prepare")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let redirectUri: string;
        try {
          const body = (await request.json()) as { redirectUri?: unknown };
          if (typeof body.redirectUri !== "string") {
            throw new Error("Missing redirect URI");
          }
          redirectUri = body.redirectUri;

          const userCount = await db
            .select({ count: count() })
            .from(user)
            .get();
          if ((userCount?.count ?? 0) === 0) {
            throw new Error(
              "Finish setting up this Serial instance and sign in there before connecting the extension",
            );
          }

          await ensureExtensionOAuthClient(redirectUri);
        } catch (error) {
          return corsResponse(
            JSON.stringify({
              error:
                error instanceof Error
                  ? error.message
                  : "Unable to prepare extension authentication",
            }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        const issuer = `${env.PUBLIC_BASE_URL}/api/auth`;
        return corsResponse(
          JSON.stringify({
            issuer,
            clientId: SERIAL_EXTENSION_CLIENT_ID,
            scopes: SERIAL_EXTENSION_AUTH_SCOPES,
            authorizationEndpoint: `${issuer}/oauth2/authorize`,
            tokenEndpoint: `${issuer}/oauth2/token`,
            revocationEndpoint: `${issuer}/oauth2/revoke`,
            userInfoEndpoint: `${issuer}/oauth2/userinfo`,
            redirectUri,
          }),
          {
            headers: { "Content-Type": "application/json" },
          },
        );
      },
      OPTIONS: () => corsResponse(null, { status: 204 }),
    },
  },
});
