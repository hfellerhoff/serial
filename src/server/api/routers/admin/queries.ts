import { eq } from "drizzle-orm";
import { db } from "~/server/db";
import { account, user } from "~/server/db/schema";
import { auth } from "~/server/auth";

/**
 * Fetches a user by ID along with their linked accounts and active sessions.
 * Shared between the oRPC `getUserById` handler and the `fetchAdminUserById`
 * server function so the query logic isn't duplicated.
 *
 * Returns null if the user doesn't exist.
 */
export async function queryUserById(userId: string, headers: Headers) {
  const [foundUser, accounts, sessionsResult] = await Promise.all([
    db.select().from(user).where(eq(user.id, userId)).get(),
    db
      .select({
        providerId: account.providerId,
        accountId: account.accountId,
        createdAt: account.createdAt,
      })
      .from(account)
      .where(eq(account.userId, userId))
      .all(),
    auth.api.listUserSessions({ headers, body: { userId } }),
  ]);

  if (!foundUser) return null;

  return {
    user: { ...foundUser, accounts },
    sessions: sessionsResult.sessions,
  };
}
