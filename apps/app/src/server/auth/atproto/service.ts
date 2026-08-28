import { and, eq, isNull, or } from "drizzle-orm";
import { getAtprotoClient } from "./client";
import { ATPROTO_SCOPE } from "./config";
import {
  disconnectAtprotoConnection,
  sweepExpiredAtprotoState,
} from "./stores";
import type { OAuthSession } from "@atproto/oauth-client-node";
import { db } from "~/server/db";
import { atprotoConnections } from "~/server/db/schema";
import { captureException } from "~/server/logger";

/**
 * The module boundary feature code talks to. Everything returns or consumes
 * DIDs and authenticated `OAuthSession`s — raw tokens never leave the
 * encrypted store. The five operations follow the accepted research shape:
 * start / finish (the login round trip), restore (authenticated client for
 * feature calls, refreshing transparently), upgrade (fresh consent for a
 * broader grant, atomically replacing the stored session), revoke.
 */

export interface AtprotoCallbackResult {
  session: OAuthSession;
  did: string;
  /** Current handle, null when resolution failed or the handle is invalid. */
  handle: string | null;
  /** The scope actually granted by the authorization server. */
  grantedScope: string;
}

/**
 * Begin an authorization flow. `input` is a handle, DID, or PDS URL; the
 * typeahead can hand over a pre-resolved DID to skip one resolution. Returns
 * the authorization URL to redirect the user to.
 */
export async function startAtprotoAuth(input: {
  identifier: string;
  scope?: string;
}): Promise<URL> {
  const client = await getAtprotoClient();
  // Opportunistic cleanup of expired attempts; never blocks the flow.
  sweepExpiredAtprotoState(db).catch(captureException);
  return client.authorize(input.identifier, {
    scope: input.scope ?? ATPROTO_SCOPE,
  });
}

/**
 * Complete the callback leg. The SDK validates state, exchanges the code,
 * and verifies the DID → PDS → authorization-server chain before the
 * session store persists anything. Refreshes the connection's display data
 * (current handle, PDS) as a side effect.
 */
export async function finishAtprotoAuth(
  params: URLSearchParams,
): Promise<AtprotoCallbackResult> {
  const client = await getAtprotoClient();
  const { session, state } = await client.callback(params);
  const did = session.did;

  // An upgrade flow pins the subject it re-consents for. If the user
  // switched accounts at the authorization server, destroy the session the
  // SDK just stored and fail — completing would swap the caller's Serial
  // session to a different user.
  const expectedDid = parseExpectedDid(state);
  if (expectedDid && expectedDid !== did) {
    await session.signOut().catch(captureException);
    throw new Error(
      `Authorization returned ${did} but the flow was started for ${expectedDid}`,
    );
  }

  const { scope: grantedScope } = await session.getTokenInfo(false);

  let handle: string | null = null;
  try {
    const info = await client.oauthResolver.resolveIdentity(did);
    if (info.handle !== "handle.invalid") handle = info.handle;
    await db
      .update(atprotoConnections)
      .set({ handle, updatedAt: new Date() })
      .where(eq(atprotoConnections.did, did));
  } catch (err) {
    // Display data only — the authenticated session is already durable.
    captureException(err);
  }

  return { session, did, handle, grantedScope };
}

function parseExpectedDid(state: string | null): string | undefined {
  if (!state) return undefined;
  try {
    const parsed = JSON.parse(state) as { expectedDid?: unknown };
    return typeof parsed.expectedDid === "string"
      ? parsed.expectedDid
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Bind a connection to its Serial user once sign-in resolved who they are.
 * The unique constraints enforce one connection per user and one user per
 * DID; the guarded update refuses to steal a connection already bound to a
 * different user and reports when no row matched, rather than surfacing a
 * constraint violation (or nothing at all) later.
 */
export async function bindAtprotoConnection(
  did: string,
  userId: string,
): Promise<void> {
  const result = await db
    .update(atprotoConnections)
    .set({ userId, updatedAt: new Date() })
    .where(
      and(
        eq(atprotoConnections.did, did),
        or(
          isNull(atprotoConnections.userId),
          eq(atprotoConnections.userId, userId),
        ),
      ),
    );
  if (result.rowsAffected === 0) {
    throw new Error(`No bindable atproto connection for ${did}`);
  }
}

/**
 * An authenticated session for feature code (PDS calls), transparently
 * refreshing through the shared lock when the access token has expired.
 * Throws when no active session exists for the DID.
 */
export async function restoreAtprotoSession(
  did: string,
): Promise<OAuthSession> {
  const client = await getAtprotoClient();
  return client.restore(did, "auto");
}

/**
 * Request a broader grant for an existing connection: a fresh consent flow
 * against the same DID. On callback the stored session and scopes are
 * replaced atomically by the session store upsert. Expected authorization
 * behavior for future capability growth (e.g. publication subscriptions),
 * not a migration.
 */
export async function upgradeAtprotoAuth(
  did: string,
  scope: string,
): Promise<URL> {
  const client = await getAtprotoClient();
  return client.authorize(did, {
    scope,
    prompt: "consent",
    // Verified at the callback: an upgrade must come back for this DID.
    state: JSON.stringify({ expectedDid: did }),
  });
}

/**
 * Best-effort revocation of a user's grant before their row is deleted:
 * the FK cascade destroys the connection row and with it the encrypted
 * refresh token — the only credential able to revoke the PDS-side grant.
 * Never throws; user deletion must not be blocked by an unreachable
 * authorization server.
 */
export async function revokeAtprotoGrantsForUser(
  userId: string,
): Promise<void> {
  try {
    const row = await db
      .select({
        did: atprotoConnections.did,
        session: atprotoConnections.session,
      })
      .from(atprotoConnections)
      .where(eq(atprotoConnections.userId, userId))
      .get();
    if (!row?.session) return;
    await revokeAtprotoConnection(row.did);
  } catch (err) {
    captureException(err);
  }
}

/**
 * Revoke the grant server-side and destroy the local credential material.
 * The local session is destroyed even when the server-side call fails —
 * fail toward fewer live credentials.
 */
export async function revokeAtprotoConnection(did: string): Promise<void> {
  const client = await getAtprotoClient();
  try {
    await client.revoke(did);
  } catch (err) {
    captureException(err);
    await disconnectAtprotoConnection(db, did);
  }
}
