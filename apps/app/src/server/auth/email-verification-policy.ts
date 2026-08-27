import { eq } from "drizzle-orm";
import type { db as defaultDb } from "~/server/db";
import { account, user } from "~/server/db/schema";

type VerificationDatabase = typeof defaultDb;

/**
 * Email verification is a credential-account concern: only users who sign in
 * with an email + password pair must prove they own the address. Users
 * provisioned by an identity provider (generic OAuth today, atproto later)
 * are exempt — the provider vouches for their identity, and forcing
 * verification would lock them out of accounts they can already access.
 *
 * The exemption is materialized as `user.emailVerificationExempt` so the
 * per-request decision reads session state and never touches the database.
 * Exemption depends only on which account rows exist — never their contents —
 * so account creation is the sole event that can change it: the create hook
 * in ./index.tsx recomputes the flag, and post-migration 0048 backfills it.
 * Staleness always errs closed: the unhookable paths (account deletion) can
 * only leave a user non-exempt who could be exempt, never the reverse.
 *
 * Caution: this helper writes the user row directly, bypassing Better Auth's
 * internalAdapter and its session-refresh bookkeeping. That is safe today
 * because session cookie caching is disabled (every getSession re-reads the
 * user row). If `session.cookieCache` is ever enabled, a cached cookie could
 * keep a stale `emailVerificationExempt: true` for the cache TTL after a
 * credential account is added — a fail-open window. Route this write through
 * the internal adapter (or invalidate the user's session cache) first.
 */
export function requiresEmailVerification(sessionUser: {
  emailVerified: boolean;
  emailVerificationExempt: boolean;
}): boolean {
  return !sessionUser.emailVerified && !sessionUser.emailVerificationExempt;
}

/**
 * The fail-closed exemption rule: exempt only when accounts exist and none of
 * them is a credential account. A user with no accounts at all must verify
 * rather than being silently exempted, and a credential row always counts —
 * even a malformed one with no stored password.
 */
export function computeEmailVerificationExempt(
  accounts: Array<{ providerId: string }>,
): boolean {
  if (accounts.length === 0) return false;
  return !accounts.some((row) => row.providerId === "credential");
}

/**
 * Recompute and persist the exemption flag from the user's current account
 * rows. Called from the account-creation hook — a rare mutation, so the
 * account-table lookup happens here instead of on every navigation.
 */
export async function refreshEmailVerificationExempt(
  database: VerificationDatabase,
  userId: string,
): Promise<void> {
  const accounts = await database
    .select({ providerId: account.providerId })
    .from(account)
    .where(eq(account.userId, userId))
    .all();

  await database
    .update(user)
    .set({ emailVerificationExempt: computeEmailVerificationExempt(accounts) })
    .where(eq(user.id, userId));
}
