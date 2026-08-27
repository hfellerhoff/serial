import { eq } from "drizzle-orm";
import type { db as defaultDb } from "~/server/db";
import { account } from "~/server/db/schema";

type VerificationDatabase = typeof defaultDb;

/**
 * Email verification is a credential-account concern: only users who sign in
 * with an email + password pair must prove they own the address. Users
 * provisioned by an identity provider (generic OAuth today, atproto later)
 * are exempt — the provider vouches for their identity, and forcing
 * verification would lock them out of accounts they can already access.
 *
 * The rule fails closed: a user with a credential account (matching Better
 * Auth's definition — providerId "credential" with a stored password) must
 * verify even if they also have provider accounts, and a user with no
 * accounts at all must verify rather than being silently exempted.
 *
 * Verified users short-circuit without touching the database, so the common
 * per-request path costs nothing extra.
 */
export async function requiresEmailVerification(
  database: VerificationDatabase,
  sessionUser: { id: string; emailVerified: boolean },
): Promise<boolean> {
  if (sessionUser.emailVerified) return false;

  const accounts = await database
    .select({ providerId: account.providerId, password: account.password })
    .from(account)
    .where(eq(account.userId, sessionUser.id))
    .all();

  if (accounts.length === 0) return true;

  return accounts.some(
    (row) => row.providerId === "credential" && row.password != null,
  );
}
