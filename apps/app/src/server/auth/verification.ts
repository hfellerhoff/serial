import { and, eq } from "drizzle-orm";
import { account } from "../db/schema";
import type { db as defaultDb } from "../db";

type VerificationDatabase = typeof defaultDb;

/**
 * Email verification is a credential-account concern: only users who sign in
 * with an email + password pair must prove they own the address. Users
 * provisioned by an identity provider (generic OAuth today, atproto later)
 * are exempt — their email is provider-attested or a placeholder, and forcing
 * verification would lock them out of accounts they can already access.
 *
 * Verified users short-circuit without touching the database, so the common
 * per-request path costs nothing extra.
 */
export async function requiresEmailVerification(
  database: VerificationDatabase,
  sessionUser: { id: string; emailVerified: boolean },
): Promise<boolean> {
  if (sessionUser.emailVerified) return false;

  const credential = await database
    .select({ id: account.id })
    .from(account)
    .where(
      and(
        eq(account.userId, sessionUser.id),
        eq(account.providerId, "credential"),
      ),
    )
    .get();

  return credential !== undefined;
}
