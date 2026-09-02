import type { AuthAttempt, CompletedAuth } from "~/server/auth/policy";
import { ATPROTO_ROUTES } from "~/server/auth/atproto/config";

/**
 * Classify a Better Auth request path into the explicit provider identity
 * and intent the shared policy service consumes. OAuth-style providers
 * (generic OAuth, atproto) gate as sign-in for both the start and callback
 * paths; disallowed auto-signups are rolled back by the post-auth policy
 * instead.
 *
 * The atproto link paths are deliberately unclassified: a link attaches a
 * connection to an existing session, creates no user and issues no
 * session, so neither sign-in gating nor auto-signup rollback may apply.
 * Both matchers use exact equality so the link callback can never be
 * swept in by a prefix match.
 */
export function classifyAuthRequest(
  path: string,
): Pick<AuthAttempt, "provider" | "intent"> | undefined {
  if (path.startsWith("/sign-up")) {
    return { provider: "email", intent: "sign-up" };
  }
  if (path === "/sign-in/email") {
    return { provider: "email", intent: "sign-in" };
  }
  if (
    path.startsWith("/sign-in/oauth2") ||
    path.startsWith("/oauth2/callback/")
  ) {
    return { provider: "oauth", intent: "sign-in" };
  }
  // The typeahead gates with the rest of the atproto surface so a disabled
  // provider exposes no anonymous relay into the AppView search index.
  if (
    path === ATPROTO_ROUTES.authorize ||
    path === ATPROTO_ROUTES.callback ||
    path === ATPROTO_ROUTES.typeahead
  ) {
    return { provider: "atproto", intent: "sign-in" };
  }
  return undefined;
}

/**
 * Classify a Better Auth request path into the completed-flow identity the
 * post-auth policy consumes. Only sign-up-capable paths return a value:
 * email sign-up creates a user directly, and the OAuth callback may have
 * auto-created one.
 */
export function classifyCompletedAuth(
  path: string,
): Pick<CompletedAuth, "provider" | "flow"> | undefined {
  if (path.startsWith("/sign-up")) {
    return { provider: "email", flow: "sign-up" };
  }
  if (path.startsWith("/oauth2/callback/")) {
    return { provider: "oauth", flow: "callback" };
  }
  if (path === ATPROTO_ROUTES.callback) {
    return { provider: "atproto", flow: "callback" };
  }
  return undefined;
}
