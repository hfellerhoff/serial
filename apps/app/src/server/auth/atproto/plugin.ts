import { z } from "zod";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { handleOAuthUserInfo } from "better-auth/oauth2";
import { ATPROTO_PROVIDER_ID, placeholderEmailForDid } from "./config";
import { getAtprotoClient } from "./client";
import {
  bindAtprotoConnection,
  finishAtprotoAuth,
  startAtprotoAuth,
} from "./service";
import type { BetterAuthPlugin } from "better-auth";
import { logError } from "~/server/logger";

/**
 * Serial-owned Better Auth plugin for AT Protocol OAuth. Mounted under the
 * existing /api/auth catch-all, so the shared policy hooks in
 * server/auth/index.tsx fire for these paths like any other provider:
 * /atproto/authorize is gated as an atproto sign-in attempt, and
 * /atproto/callback is a sign-up-capable completion whose disallowed
 * auto-signups the post-auth policy rolls back.
 *
 * Only protocol machinery lives here. Account outcome is delegated to
 * Better Auth's own OAuth account handling (DID as the immutable account
 * id, deterministic .invalid placeholder email, no token values) and the
 * shared policy service; credential material only ever touches the
 * encrypted stores.
 */

const SIGN_IN_ERROR_REDIRECT = "/auth/sign-in?error=atproto";

export const atprotoPlugin = () => {
  return {
    id: "atproto",
    endpoints: {
      atprotoClientMetadata: createAuthEndpoint(
        "/atproto/client-metadata.json",
        { method: "GET" },
        async (ctx) => {
          const client = await getAtprotoClient();
          return ctx.json(client.clientMetadata);
        },
      ),

      atprotoJwks: createAuthEndpoint(
        "/atproto/jwks.json",
        { method: "GET" },
        async (ctx) => {
          const client = await getAtprotoClient();
          return ctx.json(client.jwks);
        },
      ),

      /**
       * Start the login round trip. `identifier` is what the user typed (a
       * handle or DID); `did` is an optional pre-resolved DID from the
       * typeahead, trusted only as a resolution shortcut — the SDK still
       * verifies the full identity chain before any session exists.
       */
      atprotoAuthorize: createAuthEndpoint(
        "/atproto/authorize",
        {
          method: "POST",
          body: z.object({
            identifier: z.string().trim().min(1).max(512),
            did: z.string().trim().min(1).max(512).optional(),
          }),
        },
        async (ctx) => {
          try {
            const url = await startAtprotoAuth({
              identifier: ctx.body.did ?? ctx.body.identifier,
            });
            return ctx.json({ url: url.toString() });
          } catch (err) {
            logError("[atproto] authorize failed:", err);
            throw new APIError("BAD_REQUEST", {
              message:
                "Could not start Atmosphere sign in for that handle. Check the handle and try again.",
            });
          }
        },
      ),

      atprotoCallback: createAuthEndpoint(
        "/atproto/callback",
        { method: "GET" },
        async (ctx) => {
          const url = new URL(ctx.request?.url ?? "http://invalid");
          let result;
          try {
            result = await finishAtprotoAuth(url.searchParams);
          } catch (err) {
            // Covers user-denied consent, expired/replayed state, code
            // exchange failures, and DID → PDS → issuer chain mismatches
            // (the SDK verifies the chain before returning a session).
            logError("[atproto] callback failed:", err);
            throw ctx.redirect(SIGN_IN_ERROR_REDIRECT);
          }

          const { did, handle } = result;
          const outcome = await handleOAuthUserInfo(ctx, {
            userInfo: {
              id: did,
              email: placeholderEmailForDid(did),
              name: handle ?? did,
              emailVerified: false,
              image: undefined,
            },
            account: {
              providerId: ATPROTO_PROVIDER_ID,
              accountId: did,
              scope: result.grantedScope,
            },
            callbackURL: "/",
            // Serial's providerId namespace is developer-controlled, but
            // atproto identities must never inherit linking trust from a
            // name match against generic trusted providers.
            trustProviderByName: false,
          });

          if (outcome.error || !outcome.data) {
            logError("[atproto] account resolution failed:", outcome.error);
            throw ctx.redirect(SIGN_IN_ERROR_REDIRECT);
          }

          const { session, user } = outcome.data;
          await bindAtprotoConnection(did, user.id);
          await setSessionCookie(ctx, { session, user });
          throw ctx.redirect(`${ctx.context.options.baseURL ?? ""}/`);
        },
      ),
    },
    rateLimit: [
      {
        pathMatcher: (path: string) => path === "/atproto/authorize",
        window: 60,
        max: 10,
      },
      {
        pathMatcher: (path: string) => path === "/atproto/callback",
        window: 60,
        max: 30,
      },
      {
        // Metadata documents are fetched by authorization servers and
        // PDSes, not browsers; the global window applies.
        pathMatcher: (path: string) => path.startsWith("/atproto/"),
        window: 60,
        max: 60,
      },
    ],
  } satisfies BetterAuthPlugin;
};
