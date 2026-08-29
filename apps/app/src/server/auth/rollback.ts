import { deleteSessionCookie } from "better-auth/cookies";
import { and, eq, gte } from "drizzle-orm";
import { db } from "../db";
import { account, atprotoConnections, session, user } from "../db/schema";
import type { GenericEndpointContext } from "better-auth";
import { isAtprotoConfigured } from "~/server/auth/constants";
import { AUTO_SIGNUP_ROLLBACK_WINDOW_MS } from "~/server/auth/policy";
import { logError } from "~/server/logger";

/**
 * Best-effort revocation of a user's atproto grant before their row is
 * deleted. Deletion destroys the connection row and with it the encrypted
 * refresh token — the only credential able to revoke the PDS-side grant —
 * so every user-deletion path (the deleteUser beforeDelete hook and the
 * auto-signup rollback below) must run this first. Never throws.
 */
export async function revokeAtprotoGrantsBeforeUserDeletion(
  userId: string,
): Promise<void> {
  if (!isAtprotoConfigured()) return;
  const { revokeAtprotoGrantsForUser } =
    await import("~/server/auth/atproto/service");
  await revokeAtprotoGrantsForUser(userId);
}

/**
 * Server-side deletion of a user a sign-up-capable callback just
 * auto-created. Better Auth's deleteUser API authenticates the caller from
 * request cookies, which the after-hook's request does not carry — the new
 * session only exists on the response — so rollback deletes directly.
 *
 * Every destructive step is behind the rollback-window guard, so this
 * primitive cannot harm an established account even through a buggy
 * caller: outside the window nothing at all is touched — not even the
 * grant revocation, which would otherwise sever a real user's Atmosphere
 * connection. The guarded delete inside the transaction re-checks the
 * window as the TOCTOU backstop. The account, session, and connection
 * deletes duplicate the schema's FK cascades on purpose: with foreign-key
 * enforcement ever off, a surviving orphan account row would read as an
 * existing account at the authorize pre-flight and silently re-open the
 * signup bypass.
 */
export async function rollbackAutoCreatedUser(userId: string): Promise<void> {
  const cutoff = new Date(Date.now() - AUTO_SIGNUP_ROLLBACK_WINDOW_MS);
  const justCreated = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.id, userId), gte(user.createdAt, cutoff)))
    .get();
  if (!justCreated) {
    logError(
      `[auth] auto-signup rollback matched no just-created user row for ${userId}; leaving every related row untouched`,
    );
    return;
  }

  await revokeAtprotoGrantsBeforeUserDeletion(userId);
  await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(user)
      .where(and(eq(user.id, userId), gte(user.createdAt, cutoff)));
    if (deleted.rowsAffected === 0) return;
    await tx.delete(session).where(eq(session.userId, userId));
    await tx.delete(account).where(eq(account.userId, userId));
    await tx
      .delete(atprotoConnections)
      .where(eq(atprotoConnections.userId, userId));
  });
}

/**
 * Hook-context rollback: whether or not the deletion succeeds, the
 * response must not ship a usable session cookie — the endpoint's success
 * path already merged one into the response headers before the after-hook
 * ran, and a failed deletion would otherwise leave the browser signed in
 * to the surviving auto-created user.
 */
export async function rollbackAutoCreatedUserFromHook(
  ctx: GenericEndpointContext,
  userId: string,
): Promise<void> {
  try {
    await rollbackAutoCreatedUser(userId);
  } finally {
    deleteSessionCookie(ctx);
  }
}
