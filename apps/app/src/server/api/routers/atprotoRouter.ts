import { ORPCError } from "@orpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  ATPROTO_PROVIDER_ID,
  getAdminSigninMethods,
  getEnabledAuthProviders,
} from "~/lib/constants";
import { identifierSchema } from "~/server/auth/atproto/schemas";
import { getKV } from "~/server/kv";
import {
  isAtprotoConfigured,
  isOAuthConfigured,
} from "~/server/auth/constants";
import { refreshEmailVerificationExempt } from "~/server/auth/email-verification-policy";
import { account, appConfig, atprotoConnections } from "~/server/db/schema";
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
    const [connection, accountRow] = await Promise.all([
      context.db.query.atprotoConnections.findFirst({
        where: eq(atprotoConnections.userId, context.user.id),
      }),
      context.db
        .select({ accountId: account.accountId })
        .from(account)
        .where(
          and(
            eq(account.userId, context.user.id),
            eq(account.providerId, ATPROTO_PROVIDER_ID),
          ),
        )
        .get(),
    ]);

    const isConnected =
      !!connection && connection.status === "active" && !!connection.session;
    // The sign-in method (the account row) can outlive its working
    // credentials: a bound row whose blob was destroyed (failed refresh,
    // grant revoked at the PDS, rotated store key) or a connection lost
    // mid-unlink. Either way the row must surface reconnect and disconnect
    // affordances rather than a bare "not connected".
    const needsReconnect = (!!connection || !!accountRow) && !isConnected;

    return {
      isConnected,
      needsReconnect,
      handle:
        connection?.handle ??
        connection?.did ??
        accountRow?.accountId ??
        null,
      isConfigured: isAtprotoConfigured(),
    };
  },
);

/**
 * Each link start fans out to identity resolution and writes an auth-state
 * row with a 1-hour TTL, so it gets the same kind of budget the plugin
 * puts on its authorize endpoint — here per user, since the procedure is
 * session-required. The read-then-write window can undercount a burst
 * slightly; this is an abuse ceiling, not an exact quota.
 */
const LINK_RATE_LIMIT_MAX_PER_WINDOW = 10;
const LINK_RATE_LIMIT_WINDOW_SECONDS = 60;

async function enforceLinkRateLimit(userId: string): Promise<void> {
  const kv = await getKV();
  const window = Math.floor(Date.now() / (LINK_RATE_LIMIT_WINDOW_SECONDS * 1000));
  const key = `atproto-link-rate:${userId}:${window}`;
  const count = Number((await kv.get(key)) ?? "0");
  if (count >= LINK_RATE_LIMIT_MAX_PER_WINDOW) {
    throw new ORPCError("TOO_MANY_REQUESTS", {
      message: "Too many connection attempts. Try again in a minute.",
    });
  }
  await kv.set(key, String(count + 1), LINK_RATE_LIMIT_WINDOW_SECONDS * 2);
}

export const linkAccount = protectedProcedure
  .input(z.object({ identifier: identifierSchema }))
  .handler(async ({ context, input }) => {
    if (!isAtprotoConfigured()) {
      throw new ORPCError("PRECONDITION_FAILED", {
        message: "Atmosphere is not available on this instance.",
      });
    }
    await enforceLinkRateLimit(context.user.id);

    const connection = await context.db.query.atprotoConnections.findFirst({
      where: eq(atprotoConnections.userId, context.user.id),
    });
    if (connection && connection.status === "active" && !!connection.session) {
      throw new ORPCError("CONFLICT", {
        message:
          "You already have an Atmosphere account connected. Disconnect it first.",
      });
    }

    // A different DID already attached (even with a disconnected
    // connection) would only fail at the callback with "exists", burning a
    // real grant at the PDS. A typed handle can't be compared to the
    // stored DID before resolution, so this blocks only the clear case;
    // the callback stays the authoritative enforcement either way.
    const existingAccount = await context.db
      .select({ accountId: account.accountId })
      .from(account)
      .where(
        and(
          eq(account.userId, context.user.id),
          eq(account.providerId, ATPROTO_PROVIDER_ID),
        ),
      )
      .get();
    if (
      existingAccount &&
      input.identifier.startsWith("did:") &&
      existingAccount.accountId !== input.identifier
    ) {
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
    .select({
      id: account.id,
      userId: account.userId,
      providerId: account.providerId,
    })
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

  // Refuse to remove the user's sole sign-in method. Methods are counted
  // by the same shared accounting the admin lockout guard uses, then
  // intersected with the enabled sign-in providers: a credential row is no
  // way back in while email sign-in is switched off.
  const signinConfig = await context.db
    .select({ value: appConfig.value })
    .from(appConfig)
    .where(eq(appConfig.key, "enabled-signin-providers"))
    .get();
  const enabledProviders = getEnabledAuthProviders(signinConfig?.value);
  const [methods = []] = getAdminSigninMethods({
    adminUserIds: [context.user.id],
    accountRows,
    oauthProviderId: isOAuthConfigured() ? env.OAUTH_PROVIDER_ID : undefined,
    atprotoConfigured: isAtprotoConfigured(),
  });
  const remainingMethods = methods.filter(
    (method) => method !== "atproto" && enabledProviders.includes(method),
  );
  if (atprotoRows.length > 0 && remainingMethods.length === 0) {
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
