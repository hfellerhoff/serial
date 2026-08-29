import { deleteSessionCookie } from "better-auth/cookies";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { user } from "../db/schema";
import type { GenericEndpointContext } from "better-auth";
import { isAtprotoConfigured } from "~/server/auth/constants";

/**
 * Server-side deletion of a user a sign-up-capable callback just
 * auto-created. Better Auth's deleteUser API authenticates the caller from
 * request cookies, which the after-hook's request does not carry — the new
 * session only exists on the response — so rollback deletes the user row
 * directly and lets the schema's FK cascades remove the account, session,
 * and atproto connection rows with it.
 */
export async function rollbackAutoCreatedUser(userId: string): Promise<void> {
  if (isAtprotoConfigured()) {
    // The cascade destroys the encrypted refresh token — the only
    // credential able to revoke the PDS-side grant — so revoke first,
    // best-effort (never throws), mirroring the deleteUser beforeDelete
    // hook.
    const { revokeAtprotoGrantsForUser } =
      await import("~/server/auth/atproto/service");
    await revokeAtprotoGrantsForUser(userId);
  }
  await db.delete(user).where(eq(user.id, userId));
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
