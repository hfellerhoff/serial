import { and, eq, isNotNull, isNull, lt, or } from "drizzle-orm";
import { getAtprotoClient } from "./client";
import {
  ATPROTO_PROVIDER_ID,
  ATPROTO_SCOPE,
  AUTH_STATE_TTL_MS,
  getAtprotoLinkRedirectUri,
} from "./config";
import {
  disconnectAtprotoConnection,
  sweepExpiredAtprotoState,
} from "./stores";
import type { AtprotoRedirectUri } from "./config";
import type { OAuthSession } from "@atproto/oauth-client-node";
import { db } from "~/server/db";
import { account, atprotoConnections } from "~/server/db/schema";
import { getKV } from "~/server/kv";
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
  /**
   * The user a link flow was started for (from the server-stored app
   * state), null for sign-in and upgrade flows. The link callback must
   * verify it against the current session before attaching anything.
   */
  linkUserId: string | null;
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
  sweepStaleAtprotoConnections().catch(captureException);
  return client.authorize(input.identifier, {
    scope: input.scope ?? ATPROTO_SCOPE,
  });
}

/**
 * Resolve a typed identifier to its DID without starting a flow, so the
 * authorize endpoint can pre-flight sign-up policy before issuing a
 * redirect. A value that is already a DID is returned as-is: the SDK
 * verifies the full identity chain during the callback regardless, and the
 * pre-flight only needs the same value the flow itself will authorize
 * with.
 */
export async function resolveAtprotoDid(identifier: string): Promise<string> {
  if (identifier.startsWith("did:")) return identifier;
  const client = await getAtprotoClient();
  const info = await client.oauthResolver.resolveIdentity(identifier);
  return info.did;
}

/** At most one revocation sweep per interval, instance-wide via KV. */
const SWEEP_INTERVAL_SECONDS = 5 * 60;
/** Revocations are serial outbound calls; bound the batch per sweep. */
const SWEEP_MAX_REVOCATIONS = 10;

/**
 * Opportunistic cleanup: revoke stale unbound connections that still hold
 * credentials (a link or sign-in whose callback completed the code
 * exchange but never bound a user), then remove expired state and
 * credential-free unbound rows. Revocation disconnects the row, so the
 * store sweep can delete it once it goes stale again. Fires on the
 * authorize paths, so it is throttled and bounded: revocations are
 * network calls, and an authorization-server outage must not multiply
 * them under concurrent sign-ins.
 */
async function sweepStaleAtprotoConnections(): Promise<void> {
  const kv = await getKV();
  const acquired = await kv.setNX(
    "atproto-connection-sweep",
    "running",
    SWEEP_INTERVAL_SECONDS,
  );
  if (!acquired) return;

  const cutoff = new Date(Date.now() - AUTH_STATE_TTL_MS);
  const orphans = await db
    .select({ did: atprotoConnections.did })
    .from(atprotoConnections)
    .where(
      and(
        isNull(atprotoConnections.userId),
        isNotNull(atprotoConnections.session),
        lt(atprotoConnections.updatedAt, cutoff),
      ),
    )
    .limit(SWEEP_MAX_REVOCATIONS)
    .all();
  for (const orphan of orphans) {
    await revokeAtprotoConnection(orphan.did);
  }
  await sweepExpiredAtprotoState(db);
}

/**
 * Complete the callback leg. The SDK validates state, exchanges the code,
 * and verifies the DID → PDS → authorization-server chain before the
 * session store persists anything. Refreshes the connection's display data
 * (current handle, PDS) as a side effect.
 */
export async function finishAtprotoAuth(
  params: URLSearchParams,
  options?: {
    /**
     * The redirect URI this callback is being served on, when it is not
     * the default sign-in callback (the SDK exchanges the code against the
     * first registered redirect URI unless told otherwise).
     */
    redirectUri?: AtprotoRedirectUri;
    /**
     * Skip the handle resolution (the result's `handle` stays null) so the
     * caller can run it after its own critical writes. Resolution verifies
     * the handle bidirectionally over DNS/well-known and can stall for tens
     * of seconds on a slow domain; the link callback must not let display
     * data hold up the user bind and the redirect, or the connections UI
     * reads "Not connected" long after consent was granted. Sign-in keeps
     * the blocking default: the handle names the auto-created user.
     */
    deferHandleResolution?: boolean;
  },
): Promise<AtprotoCallbackResult> {
  const client = await getAtprotoClient();
  const { session, state } = await client.callback(
    params,
    options?.redirectUri ? { redirect_uri: options.redirectUri } : undefined,
  );
  const did = session.did;
  const appState = parseAppState(state);

  // An upgrade flow pins the subject it re-consents for. If the user
  // switched accounts at the authorization server, destroy the session the
  // SDK just stored and fail — completing would swap the caller's Serial
  // session to a different user.
  const expectedDid = appState.expectedDid;
  if (expectedDid && expectedDid !== did) {
    await session.signOut().catch(captureException);
    throw new Error(
      `Authorization returned ${did} but the flow was started for ${expectedDid}`,
    );
  }

  const { scope: grantedScope } = await session.getTokenInfo(false);

  const handle = options?.deferHandleResolution
    ? null
    : await resolveAndStoreAtprotoHandle(did);

  return {
    session,
    did,
    handle,
    grantedScope,
    linkUserId: appState.linkUserId ?? null,
  };
}

/**
 * Resolve a connection's current handle and store it — display data only,
 * the authenticated session is already durable, so every failure degrades
 * to null (the UI falls back to the DID). The link callback runs this
 * fire-and-forget after binding the user, so slow DNS/well-known
 * verification can never delay the redirect or the connected state.
 */
export async function resolveAndStoreAtprotoHandle(
  did: string,
): Promise<string | null> {
  try {
    const client = await getAtprotoClient();
    const info = await client.oauthResolver.resolveIdentity(did);
    const handle = info.handle !== "handle.invalid" ? info.handle : null;
    await db
      .update(atprotoConnections)
      .set({ handle, updatedAt: new Date() })
      .where(eq(atprotoConnections.did, did));
    return handle;
  } catch (err) {
    captureException(err);
    return null;
  }
}

/**
 * The app state Serial threads through authorize(): `expectedDid` pins an
 * upgrade's subject, `linkUserId` records who a link flow was started for.
 * Stored server-side by the SDK's state store, so neither is forgeable
 * from the callback URL.
 */
function parseAppState(state: string | null): {
  expectedDid?: string;
  linkUserId?: string;
} {
  if (!state) return {};
  try {
    const parsed = JSON.parse(state) as {
      expectedDid?: unknown;
      linkUserId?: unknown;
    };
    return {
      expectedDid:
        typeof parsed.expectedDid === "string" ? parsed.expectedDid : undefined,
      linkUserId:
        typeof parsed.linkUserId === "string" ? parsed.linkUserId : undefined,
    };
  } catch {
    return {};
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
 * Begin a link flow for a signed-in user: same authorize round trip as
 * sign-in, but the server-stored app state pins who it was started for and
 * the redirect lands on the link callback, which the policy classifiers
 * deliberately do not gate as a sign-in.
 */
export async function startAtprotoLink(input: {
  identifier: string;
  userId: string;
}): Promise<URL> {
  const client = await getAtprotoClient();
  sweepStaleAtprotoConnections().catch(captureException);
  return client.authorize(input.identifier, {
    scope: ATPROTO_SCOPE,
    state: JSON.stringify({ linkUserId: input.userId }),
    redirect_uri: getAtprotoLinkRedirectUri(),
  });
}

/**
 * A link attempt failed for a reason the user can act on. The code maps to
 * the redirect result the app shell toasts: "conflict" when the DID belongs
 * to a different Serial user, "exists" when this user already has a
 * different Atmosphere account attached, "state" when the callback did not
 * match the session that started the flow.
 */
export class AtprotoLinkError extends Error {
  constructor(
    public readonly code: "conflict" | "exists" | "state",
    message: string,
  ) {
    super(message);
    this.name = "AtprotoLinkError";
  }
}

/**
 * Attach a verified DID to the signed-in user: the account row (the key
 * either-method sign-in resolves through) plus the connection binding. The
 * account row is created through the caller-supplied adapter so Better
 * Auth's database hooks fire (the email-verification exemption recompute).
 * Conflicts never steal: a DID owned by another user and a second DID for
 * the same user are both refused.
 */
export async function completeAtprotoLink(input: {
  did: string;
  grantedScope: string;
  /** The signed-in user completing the callback. */
  sessionUserId: string;
  /** Who the flow was started for, from the server-stored app state. */
  linkUserId: string | null;
  createAccountRow: (data: {
    userId: string;
    providerId: string;
    accountId: string;
    scope: string;
  }) => Promise<{ id: string }>;
}): Promise<void> {
  const { did, sessionUserId } = input;

  if (!input.linkUserId || input.linkUserId !== sessionUserId) {
    throw new AtprotoLinkError(
      "state",
      `Link callback for ${did} did not match the session that started it`,
    );
  }

  const existingForDid = await db
    .select({ id: account.id, userId: account.userId })
    .from(account)
    .where(
      and(
        eq(account.providerId, ATPROTO_PROVIDER_ID),
        eq(account.accountId, did),
      ),
    )
    .get();
  if (existingForDid && existingForDid.userId !== sessionUserId) {
    throw new AtprotoLinkError(
      "conflict",
      `${did} is already linked to another user`,
    );
  }

  const existingForUser = await db
    .select({ id: account.id, accountId: account.accountId })
    .from(account)
    .where(
      and(
        eq(account.userId, sessionUserId),
        eq(account.providerId, ATPROTO_PROVIDER_ID),
      ),
    )
    .get();
  if (existingForUser && existingForUser.accountId !== did) {
    throw new AtprotoLinkError(
      "exists",
      `User already has a different atproto account (${existingForUser.accountId})`,
    );
  }

  let createdAccountId: string | null = null;
  if (!existingForDid) {
    const created = await input.createAccountRow({
      userId: sessionUserId,
      providerId: ATPROTO_PROVIDER_ID,
      accountId: did,
      scope: input.grantedScope,
    });
    createdAccountId = created.id;
  }

  try {
    await bindAtprotoConnection(did, sessionUserId);
  } catch (err) {
    // A concurrent bind won the race for this DID. Remove the account row
    // just created so a half-linked state can't power a later sign-in.
    if (createdAccountId) {
      try {
        await db.delete(account).where(eq(account.id, createdAccountId));
      } catch (cleanupErr) {
        captureException(cleanupErr);
      }
    }
    throw new AtprotoLinkError(
      "conflict",
      err instanceof Error ? err.message : `Could not bind ${did}`,
    );
  }
}

/**
 * Revoke a DID's stored session only when its connection row is unbound —
 * the cleanup for a failed link or sign-in whose code exchange already
 * stored credentials. A bound row is deliberately left alone: whoever
 * completed that exchange authenticated as the DID at the PDS, the
 * account row already maps the DID to its owning user for sign-in, and
 * the freshly stored session is an equally valid credential for the same
 * identity backing the owner's connection — revoking it would only break
 * the owner (the SDK revokes the previous grant before the exchange, so
 * there is no older session to fall back to).
 */
export async function revokeAtprotoConnectionIfUnbound(
  did: string,
): Promise<void> {
  const row = await db
    .select({ userId: atprotoConnections.userId })
    .from(atprotoConnections)
    .where(eq(atprotoConnections.did, did))
    .get();
  if (row && row.userId !== null) return;
  await revokeAtprotoConnection(did);
}

/**
 * Sever a user's connection: revoke the grant (server-side and locally)
 * and release the connection row so the DID can be linked again later.
 * The unbound row is swept by sweepExpiredAtprotoState once stale. Returns
 * whether a connection existed. Account-row policy (the sole-sign-in-method
 * guard) belongs to the caller.
 */
export async function unlinkAtprotoConnection(userId: string): Promise<void> {
  const row = await db
    .select({ id: atprotoConnections.id, did: atprotoConnections.did })
    .from(atprotoConnections)
    .where(eq(atprotoConnections.userId, userId))
    .get();
  if (!row) return;
  await revokeAtprotoConnection(row.did);
  await db
    .update(atprotoConnections)
    .set({ userId: null, updatedAt: new Date() })
    .where(eq(atprotoConnections.id, row.id));
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
 * The disconnect runs unconditionally: the SDK's `revoke` silently returns
 * (rather than throwing) when the stored session is unreadable — a rotated
 * store key, for instance — and that row must not stay active with stale
 * ciphertext. Fail toward fewer live credentials.
 */
export async function revokeAtprotoConnection(did: string): Promise<void> {
  try {
    // Client construction stays inside the try: a failure there (bad
    // keyset, unreachable config) must still fall through to disconnect.
    const client = await getAtprotoClient();
    await client.revoke(did);
  } catch (err) {
    captureException(err);
  } finally {
    await disconnectAtprotoConnection(db, did);
  }
}
