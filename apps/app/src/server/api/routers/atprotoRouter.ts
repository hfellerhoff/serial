import { ORPCError } from "@orpc/server";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { CREDENTIAL_PROVIDER_ID } from "~/lib/constants";
import { ATPROTO_PROVIDER_ID } from "~/server/auth/atproto/config";
import { identifierSchema } from "~/server/auth/atproto/schemas";
import {
  isAtprotoConfigured,
  isOAuthConfigured,
} from "~/server/auth/constants";
import { refreshEmailVerificationExempt } from "~/server/auth/email-verification-policy";
import { account, atprotoConnections } from "~/server/db/schema";
import { protectedProcedure } from "~/server/orpc/base";
import { logError } from "~/server/logger";
import { env } from "~/env";

/**
 * The ConnectionsDialog surface for the AT Protocol connection: status,
 * link start, and unlink. The OAuth round trip itself lives on the Better
 * Auth plugin (server/auth/atproto/plugin.ts); linking starts here because
 * it requires the caller's session, and the callback lands on the plugin's
 * dedicated link-callback endpoint.
 */

export const getConnectionStatus = protectedProcedure.handler(
  async ({ context }) => {
    const connection = await context.db.query.atprotoConnections.findFirst({
      where: eq(atprotoConnections.userId, context.user.id),
    });

    const isConnected =
      !!connection && connection.status === "active" && !!connection.session;

    return {
      isConnected,
      handle: isConnected ? (connection.handle ?? connection.did) : null,
      isConfigured: isAtprotoConfigured(),
    };
  },
);

export const linkAccount = protectedProcedure
  .input(z.object({ identifier: identifierSchema }))
  .handler(async ({ context, input }) => {
    if (!isAtprotoConfigured()) {
      throw new ORPCError("PRECONDITION_FAILED", {
        message: "Atmosphere is not available on this instance.",
      });
    }

    const connection = await context.db.query.atprotoConnections.findFirst({
      where: eq(atprotoConnections.userId, context.user.id),
    });
    if (connection && connection.status === "active" && !!connection.session) {
      throw new ORPCError("CONFLICT", {
        message:
          "You already have an Atmosphere account connected. Disconnect it first.",
      });
    }

    try {
      // Dynamic import keeps the SDK off the module graph of unconfigured
      // instances, matching the auth module's own pattern.
      const { startAtprotoLink } = await import("~/server/auth/atproto/service");
      const url = await startAtprotoLink({
        identifier: input.identifier,
        userId: context.user.id,
      });
      return { url: url.toString() };
    } catch (err) {
      logError("[atproto] link authorize failed:", err);
      throw new ORPCError("BAD_REQUEST", {
        message:
          "Could not start the Atmosphere connection for that handle. Check the handle and try again.",
      });
    }
  });

export const unlinkAccount = protectedProcedure.handler(async ({ context }) => {
  const accountRows = await context.db
    .select({ id: account.id, providerId: account.providerId })
    .from(account)
    .where(eq(account.userId, context.user.id))
    .all();
  const atprotoRows = accountRows.filter(
    (row) => row.providerId === ATPROTO_PROVIDER_ID,
  );
  const connection = await context.db.query.atprotoConnections.findFirst({
    where: eq(atprotoConnections.userId, context.user.id),
  });

  if (atprotoRows.length === 0 && !connection) {
    return { success: true };
  }

  // Refuse to remove the user's sole sign-in method: they need a password
  // credential or a generic OAuth account on a still-configured provider
  // to keep a way back in.
  const hasCredential = accountRows.some(
    (row) => row.providerId === CREDENTIAL_PROVIDER_ID,
  );
  const hasUsableOAuth =
    isOAuthConfigured() &&
    accountRows.some((row) => row.providerId === env.OAUTH_PROVIDER_ID);
  if (atprotoRows.length > 0 && !hasCredential && !hasUsableOAuth) {
    throw new ORPCError("PRECONDITION_FAILED", {
      message:
        "Atmosphere is your only way to sign in. Add a password before disconnecting it.",
    });
  }

  if (connection) {
    // Revoke the grant server-side and destroy the credential material,
    // then release the row so the DID can be linked again later (the
    // unbound row is swept once stale).
    const { unlinkAtprotoConnection } =
      await import("~/server/auth/atproto/service");
    await unlinkAtprotoConnection(context.user.id);
  }

  if (atprotoRows.length > 0) {
    await context.db.delete(account).where(
      inArray(
        account.id,
        atprotoRows.map((row) => row.id),
      ),
    );
    // Account deletion has no Better Auth database hook; recompute the
    // email-verification exemption explicitly (fail-closed either way).
    await refreshEmailVerificationExempt(context.db, context.user.id);
  }

  return { success: true };
});
