import { z } from "zod";
import {
  APIError,
  createAuthEndpoint,
  getSessionFromCtx,
} from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { handleOAuthUserInfo } from "better-auth/oauth2";
import {
  ATPROTO_PROVIDER_ID,
  ATPROTO_ROUTE_PREFIX,
  ATPROTO_ROUTES,
  getAtprotoLinkRedirectUri,
  placeholderEmailForDid,
  validateAtprotoConfigAtStartup,
} from "./config";
import { getAtprotoClient } from "./client";
import { didSchema, identifierSchema } from "./schemas";
import {
  AtprotoLinkError,
  bindAtprotoConnection,
  completeAtprotoLink,
  finishAtprotoAuth,
  revokeAtprotoConnection,
  startAtprotoAuth,
} from "./service";
import type { BetterAuthPlugin } from "better-auth";
import type { AtprotoLinkResult } from "~/lib/auth/atproto";
import { ATPROTO_LINK_RESULT_PARAM } from "~/lib/auth/atproto";
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
const SIGN_IN_SUCCESS_REDIRECT = "/";

/**
 * Link flows return into the signed-in app rather than the auth pages; the
 * app shell reads the result param, toasts it, and reopens the connections
 * dialog.
 */
const linkResultRedirect = (result: AtprotoLinkResult) =>
  `/?${ATPROTO_LINK_RESULT_PARAM}=${result}`;

export const atprotoPlugin = () => {
  // Fail closed at startup on malformed config: the store key throws
  // synchronously into the auth module's import; a bad keyset exits the
  // process once its async import settles.
  validateAtprotoConfigAtStartup((err) => {
    logError("[atproto] invalid ATPROTO_CLIENT_PRIVATE_KEYS:", err);
    process.exit(1);
  });

  return {
    id: "atproto",
    endpoints: {
      atprotoClientMetadata: createAuthEndpoint(
        ATPROTO_ROUTES.clientMetadata,
        { method: "GET" },
        async (ctx) => {
          const client = await getAtprotoClient();
          return ctx.json(client.clientMetadata);
        },
      ),

      atprotoJwks: createAuthEndpoint(
        ATPROTO_ROUTES.jwks,
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
        ATPROTO_ROUTES.authorize,
        {
          method: "POST",
          body: z.object({
            identifier: identifierSchema,
            did: didSchema.optional(),
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
        ATPROTO_ROUTES.callback,
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

          // A link flow's code can only be exchanged against the link
          // redirect URI, so this should be unreachable — but sign-in and
          // link state must never cross, and that invariant belongs to us,
          // not the authorization server.
          if (result.linkUserId) {
            logError("[atproto] link state arrived on the sign-in callback");
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

          // Any throw past this point must stay an auth-level redirect: a
          // raw error would abort the request before the after-hook runs,
          // leaving the just-created user without post-auth policy (and
          // without rollback).
          const { session, user } = outcome.data;
          try {
            await bindAtprotoConnection(did, user.id);
            await setSessionCookie(ctx, { session, user });
          } catch (err) {
            logError("[atproto] failed to finalize sign-in:", err);
            throw ctx.redirect(SIGN_IN_ERROR_REDIRECT);
          }
          throw ctx.redirect(SIGN_IN_SUCCESS_REDIRECT);
        },
      ),

      /**
       * Complete a link flow: attach the verified DID to the signed-in
       * user as an add-on connection. Deliberately not classified by the
       * policy hooks in server/auth/index.tsx — no user is created and no
       * session is issued here, so sign-in gating and auto-signup rollback
       * do not apply; the oRPC link procedure already required a session
       * to start the flow.
       */
      atprotoLinkCallback: createAuthEndpoint(
        ATPROTO_ROUTES.linkCallback,
        { method: "GET" },
        async (ctx) => {
          const session = await getSessionFromCtx(ctx);
          if (!session) {
            throw ctx.redirect(linkResultRedirect("error"));
          }

          const url = new URL(ctx.request?.url ?? "http://invalid");
          let result;
          try {
            result = await finishAtprotoAuth(url.searchParams, {
              redirectUri: getAtprotoLinkRedirectUri(),
            });
          } catch (err) {
            logError("[atproto] link callback failed:", err);
            throw ctx.redirect(linkResultRedirect("error"));
          }

          try {
            await completeAtprotoLink({
              did: result.did,
              grantedScope: result.grantedScope,
              sessionUserId: session.user.id,
              linkUserId: result.linkUserId,
              createAccountRow: (data) =>
                ctx.context.internalAdapter.createAccount(data),
            });
          } catch (err) {
            logError("[atproto] link failed:", err);
            const isConflict =
              err instanceof AtprotoLinkError && err.code === "conflict";
            // The code exchange already stored a live session for the DID.
            // On every non-conflict failure the connection is unbound, so
            // revoke it rather than leak an orphaned grant at the PDS. A
            // conflict means the DID's row is bound to its existing owner
            // and the fresh session now backs their connection — leave it.
            if (!isConflict) {
              await revokeAtprotoConnection(result.did).catch((revokeErr) =>
                logError("[atproto] failed to revoke after link failure:", revokeErr),
              );
            }
            const linkResult: AtprotoLinkResult =
              err instanceof AtprotoLinkError && err.code !== "state"
                ? err.code
                : "error";
            throw ctx.redirect(linkResultRedirect(linkResult));
          }

          throw ctx.redirect(linkResultRedirect("success"));
        },
      ),
    },
    rateLimit: [
      // Buckets are keyed per client IP and path. Authorize stays the
      // tightest bucket because each call fans out to identity resolution.
      {
        pathMatcher: (path: string) => path === ATPROTO_ROUTES.authorize,
        window: 60,
        max: 30,
      },
      {
        pathMatcher: (path: string) =>
          path === ATPROTO_ROUTES.callback ||
          path === ATPROTO_ROUTES.linkCallback,
        window: 60,
        max: 60,
      },
      {
        // Metadata documents are fetched by authorization servers and
        // PDSes, not browsers.
        pathMatcher: (path: string) => path.startsWith(ATPROTO_ROUTE_PREFIX),
        window: 60,
        max: 120,
      },
    ],
  } satisfies BetterAuthPlugin;
};
