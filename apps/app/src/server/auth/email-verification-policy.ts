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
 * The flag is recomputed from account rows whenever an account is created or
 * updated (see the database hooks in ./index.tsx) and backfilled by
 * post-migration 0048. Staleness always errs closed: the unhookable paths
 * (account deletion) can only leave a user non-exempt who could be exempt,
 * never the reverse.
 */
export function requiresEmailVerification(sessionUser: {
  emailVerified: boolean;
  emailVerificationExempt: boolean;
}): boolean {
  return !sessionUser.emailVerified && !sessionUser.emailVerificationExempt;
}

/**
 * The fail-closed exemption rule: exempt only when accounts exist and none of
 * them is a usable credential account (matching Better Auth's definition —
 * providerId "credential" with a stored password). A user with no accounts at
 * all must verify rather than being silently exempted.
 */
export function computeEmailVerificationExempt(
  accounts: Array<{ providerId: string; password: string | null }>,
): boolean {
  if (accounts.length === 0) return false;
  return !accounts.some(
    (row) => row.providerId === "credential" && row.password != null,
  );
}

/**
 * Recompute and persist the exemption flag from the user's current account
 * rows. Called from account create/update hooks — rare mutations, so the
 * account-table lookup happens here instead of on every navigation.
 */
export async function refreshEmailVerificationExempt(
  database: VerificationDatabase,
  userId: string,
): Promise<void> {
  const accounts = await database
    .select({ providerId: account.providerId, password: account.password })
    .from(account)
    .where(eq(account.userId, userId))
    .all();

  await database
    .update(user)
    .set({ emailVerificationExempt: computeEmailVerificationExempt(accounts) })
    .where(eq(user.id, userId));
}
