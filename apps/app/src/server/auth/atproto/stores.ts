import { and, eq, isNull, lt } from "drizzle-orm";
import { AUTH_STATE_TTL_MS } from "./config";
import {
  decryptEnvelope,
  encryptEnvelope,
  EnvelopeDecryptionError,
} from "./crypto";
import type {
  NodeSavedSession,
  NodeSavedSessionStore,
  NodeSavedState,
  NodeSavedStateStore,
} from "@atproto/oauth-client-node";
import type { db as defaultDb } from "~/server/db";
import { atprotoAuthState, atprotoConnections } from "~/server/db/schema";
import { captureException } from "~/server/logger";

/**
 * The SDK's two persistence interfaces backed by Drizzle, with every stored
 * value wrapped in the AES-GCM envelope. The AAD prefixes bind an envelope
 * to its table and row, so a blob can't be replayed across rows or between
 * the state and session stores.
 */

type AtprotoDatabase = typeof defaultDb;

const stateAad = (key: string) => `atproto-state:${key}`;
const sessionAad = (did: string) => `atproto-session:${did}`;

export function createAtprotoStateStore(
  database: AtprotoDatabase,
  encryptionKey: Buffer,
): NodeSavedStateStore {
  return {
    async get(key) {
      const row = await database
        .select()
        .from(atprotoAuthState)
        .where(eq(atprotoAuthState.key, key))
        .get();
      if (!row) return undefined;
      if (row.expiresAt.getTime() <= Date.now()) {
        await database
          .delete(atprotoAuthState)
          .where(eq(atprotoAuthState.key, key));
        return undefined;
      }
      try {
        return JSON.parse(
          decryptEnvelope(encryptionKey, row.payload, stateAad(key)),
        ) as NodeSavedState;
      } catch (err) {
        if (err instanceof EnvelopeDecryptionError) {
          // Rotated key or tampered row. Delete it so the SDK sees an
          // unknown authorization session (a clean retry) instead of the
          // same poisoned row failing until its TTL.
          captureException(err);
          await database
            .delete(atprotoAuthState)
            .where(eq(atprotoAuthState.key, key));
          return undefined;
        }
        throw err;
      }
    },
    async set(key, state) {
      const now = new Date();
      const payload = encryptEnvelope(
        encryptionKey,
        JSON.stringify(state),
        stateAad(key),
      );
      const expiresAt = new Date(now.getTime() + AUTH_STATE_TTL_MS);
      await database
        .insert(atprotoAuthState)
        .values({ key, payload, createdAt: now, expiresAt })
        .onConflictDoUpdate({
          target: atprotoAuthState.key,
          set: { payload, createdAt: now, expiresAt },
        });
    },
    async del(key) {
      await database
        .delete(atprotoAuthState)
        .where(eq(atprotoAuthState.key, key));
    },
  };
}

export function createAtprotoSessionStore(
  database: AtprotoDatabase,
  encryptionKey: Buffer,
): NodeSavedSessionStore {
  return {
    async get(did) {
      const row = await database
        .select()
        .from(atprotoConnections)
        .where(eq(atprotoConnections.did, did))
        .get();
      if (!row?.session || row.status !== "active") return undefined;
      try {
        return JSON.parse(
          decryptEnvelope(encryptionKey, row.session, sessionAad(did)),
        ) as NodeSavedSession;
      } catch (err) {
        if (err instanceof EnvelopeDecryptionError) {
          // Wrong or rotated store key, or tampering. Treat the session as
          // absent — the user re-authenticates — but keep the alarm bell.
          captureException(err);
          return undefined;
        }
        throw err;
      }
    },
    async set(did, session) {
      const now = new Date();
      const envelope = encryptEnvelope(
        encryptionKey,
        JSON.stringify(session),
        sessionAad(did),
      );
      // Record what the authorization server actually said: an omitted
      // scope is stored as unknown (upgrade() consults this column), and
      // an omitted aud never clobbers a previously known PDS.
      const values = {
        session: envelope,
        scopes: session.tokenSet.scope ?? null,
        ...(session.tokenSet.aud ? { pdsUrl: session.tokenSet.aud } : {}),
        status: "active" as const,
        updatedAt: now,
      };
      await database
        .insert(atprotoConnections)
        .values({ did, createdAt: now, ...values })
        .onConflictDoUpdate({
          target: atprotoConnections.did,
          set: values,
        });
    },
    async del(did) {
      // Destroy the credential material; the row survives so the linking
      // surface can show a disconnected state and rebind later.
      await database
        .update(atprotoConnections)
        .set({ session: null, status: "disconnected", updatedAt: new Date() })
        .where(eq(atprotoConnections.did, did));
    },
  };
}

/**
 * Remove expired authorization state and connection rows that finished the
 * OAuth callback but were never bound to a user (abandoned or rolled-back
 * sign-ups). Runs opportunistically when an authorize flow starts.
 */
export async function sweepExpiredAtprotoState(
  database: AtprotoDatabase,
): Promise<void> {
  const now = Date.now();
  await database
    .delete(atprotoAuthState)
    .where(lt(atprotoAuthState.expiresAt, new Date(now)));
  await database
    .delete(atprotoConnections)
    .where(
      and(
        isNull(atprotoConnections.userId),
        lt(atprotoConnections.updatedAt, new Date(now - AUTH_STATE_TTL_MS)),
      ),
    );
}
