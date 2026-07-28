import { and, count, eq, gte, isNull, or } from "drizzle-orm";
import { db } from "~/server/db";
import { invitation, invitationRedemption, user } from "~/server/db/schema";

export interface ValidatedInvitation {
  id: string;
  maxUses: number | null;
  inviterName: string | null;
}

/**
 * Shared query logic for looking up and validating an invitation by token.
 * Accepts either the main `db` or a transaction (`tx`) for use in atomic flows.
 *
 * Returns the invitation if the token is valid, active, not expired, and has
 * remaining uses. Returns null otherwise.
 */
async function findValidInvitation(
  executor: Pick<typeof db, "select">,
  token: string,
): Promise<ValidatedInvitation | null> {
  const inv = await executor
    .select({
      id: invitation.id,
      maxUses: invitation.maxUses,
      inviterName: user.name,
    })
    .from(invitation)
    .leftJoin(user, eq(invitation.inviterId, user.id))
    .where(
      and(
        eq(invitation.token, token),
        eq(invitation.status, "active"),
        or(isNull(invitation.expiresAt), gte(invitation.expiresAt, new Date())),
      ),
    )
    .get();

  if (!inv) return null;

  // Check max uses
  if (inv.maxUses !== null) {
    const redemptionCount =
      (
        await executor
          .select({ count: count() })
          .from(invitationRedemption)
          .where(eq(invitationRedemption.invitationId, inv.id))
          .get()
      )?.count ?? 0;

    if (redemptionCount >= inv.maxUses) return null;
  }

  return inv;
}

/**
 * Validate an invitation token. Returns the invitation if the token is valid,
 * active, not expired, and has remaining uses. Returns null otherwise.
 *
 * This is a read-only check intended for display purposes (e.g., showing invite
 * info on the sign-up page). For sign-up flows, use `redeemInvitationToken`.
 */
export async function validateInvitationToken(
  token: string,
): Promise<ValidatedInvitation | null> {
  return findValidInvitation(db, token);
}

/**
 * Atomically validate an invitation token and record a redemption.
 * Uses a SQLite transaction to prevent TOCTOU races where two concurrent
 * sign-ups both pass the max-uses check before either records its redemption.
 *
 * Returns the invitation if the token is valid and the redemption was recorded,
 * or null if the token is invalid / expired / exhausted.
 */
export async function redeemInvitationToken(
  token: string,
  userId: string,
): Promise<ValidatedInvitation | null> {
  return await db.transaction(async (tx) => {
    const inv = await findValidInvitation(tx, token);
    if (!inv) return null;

    // Record the redemption atomically within the same transaction
    await tx.insert(invitationRedemption).values({
      invitationId: inv.id,
      userId,
    });

    return inv;
  });
}
