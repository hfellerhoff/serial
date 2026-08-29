import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyMigrations,
  createLocalBenchmarkTarget,
  openBenchmarkDatabase,
} from "../../../scripts/performance/database";
import type {
  NodeSavedSession,
  NodeSavedState,
} from "@atproto/oauth-client-node";
import { placeholderEmailForDid } from "~/server/auth/atproto/config";
import {
  decryptEnvelope,
  encryptEnvelope,
  EnvelopeDecryptionError,
  parseEncryptionKey,
} from "~/server/auth/atproto/crypto";
import {
  createAtprotoSessionStore,
  createAtprotoStateStore,
  disconnectAtprotoConnection,
  sweepExpiredAtprotoState,
} from "~/server/auth/atproto/stores";
import { atprotoAuthState, atprotoConnections, user } from "~/server/db/schema";

type Session = ReturnType<typeof openBenchmarkDatabase>;
type Target = ReturnType<typeof createLocalBenchmarkTarget>;
type StoreDatabase = Parameters<typeof createAtprotoStateStore>[0];

const KEY = randomBytes(32);
const OTHER_KEY = randomBytes(32);

const DID = "did:plc:abc123xyz";
const OTHER_DID = "did:plc:otheruser";

const SAVED_STATE = {
  iss: "https://auth.example.com",
  verifier: "pkce-verifier-value",
  dpopJwk: { kty: "EC", crv: "P-256", x: "x", y: "y", d: "d" },
} as unknown as NodeSavedState;

function savedSession(scope = "atproto"): NodeSavedSession {
  return {
    dpopJwk: { kty: "EC", crv: "P-256", x: "x", y: "y", d: "d" },
    tokenSet: {
      iss: "https://auth.example.com",
      sub: DID,
      aud: "https://pds.example.com",
      scope,
      access_token: "access-token-value",
      refresh_token: "refresh-token-value",
      token_type: "DPoP",
      expires_at: "2027-01-01T00:00:00.000Z",
    },
  } as unknown as NodeSavedSession;
}

describe("atproto crypto envelope", () => {
  it("round-trips plaintext under the same key and AAD", () => {
    const envelope = encryptEnvelope(KEY, "secret payload", "row-1");
    expect(envelope).not.toContain("secret");
    expect(decryptEnvelope(KEY, envelope, "row-1")).toBe("secret payload");
  });

  it("fails closed with the wrong key", () => {
    const envelope = encryptEnvelope(KEY, "secret payload", "row-1");
    expect(() => decryptEnvelope(OTHER_KEY, envelope, "row-1")).toThrow(
      EnvelopeDecryptionError,
    );
  });

  it("fails closed when the AAD (row binding) does not match", () => {
    const envelope = encryptEnvelope(KEY, "secret payload", "row-1");
    expect(() => decryptEnvelope(KEY, envelope, "row-2")).toThrow(
      EnvelopeDecryptionError,
    );
  });

  it("fails closed when the ciphertext is tampered with", () => {
    const envelope = encryptEnvelope(KEY, "secret payload", "row-1");
    const bytes = Buffer.from(envelope, "base64");
    bytes[bytes.length - 1]! ^= 0xff;
    expect(() =>
      decryptEnvelope(KEY, bytes.toString("base64"), "row-1"),
    ).toThrow(EnvelopeDecryptionError);
  });

  it("rejects unknown envelope versions", () => {
    const bytes = Buffer.from(
      encryptEnvelope(KEY, "secret payload", "row-1"),
      "base64",
    );
    bytes[0] = 0x7f;
    expect(() =>
      decryptEnvelope(KEY, bytes.toString("base64"), "row-1"),
    ).toThrow(EnvelopeDecryptionError);
  });

  it("accepts only 32-byte base64 keys", () => {
    expect(parseEncryptionKey(KEY.toString("base64"))).toEqual(KEY);
    expect(() =>
      parseEncryptionKey(randomBytes(16).toString("base64")),
    ).toThrow(/32 bytes/);
  });
});

describe("placeholderEmailForDid", () => {
  it("is deterministic and never deliverable", () => {
    const email = placeholderEmailForDid(DID);
    expect(placeholderEmailForDid(DID)).toBe(email);
    expect(email.endsWith("@atproto.invalid")).toBe(true);
    expect(email).not.toContain(":");
  });

  it("distinguishes DIDs that sanitize to the same local part", () => {
    expect(placeholderEmailForDid("did:plc:abc")).not.toBe(
      placeholderEmailForDid("did.plc.abc"),
    );
  });
});

describe("atproto database stores", () => {
  let session: Session;
  let target: Target;
  let database: StoreDatabase;

  beforeEach(async () => {
    target = createLocalBenchmarkTarget();
    session = openBenchmarkDatabase({ url: target.url });
    await applyMigrations(session.baseClient);
    database = session.database;
  });

  afterEach(() => {
    session.close();
    target.cleanup();
  });

  describe("state store", () => {
    it("round-trips saved state and stores only ciphertext", async () => {
      const store = createAtprotoStateStore(database, KEY);
      await store.set("state-key", SAVED_STATE);

      const row = await database
        .select()
        .from(atprotoAuthState)
        .where(eq(atprotoAuthState.key, "state-key"))
        .get();
      expect(row).toBeDefined();
      expect(row!.payload).not.toContain("pkce-verifier-value");
      expect(row!.expiresAt.getTime()).toBeGreaterThan(Date.now());

      expect(await store.get("state-key")).toEqual(SAVED_STATE);
    });

    it("expires state: an expired row reads as missing and is deleted", async () => {
      const store = createAtprotoStateStore(database, KEY);
      await store.set("state-key", SAVED_STATE);
      await database
        .update(atprotoAuthState)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(atprotoAuthState.key, "state-key"));

      expect(await store.get("state-key")).toBeUndefined();
      const rows = await database.select().from(atprotoAuthState).all();
      expect(rows).toHaveLength(0);
    });

    it("treats an undecryptable row as absent and deletes it", async () => {
      await createAtprotoStateStore(database, KEY).set(
        "state-key",
        SAVED_STATE,
      );
      const rotated = createAtprotoStateStore(database, OTHER_KEY);

      expect(await rotated.get("state-key")).toBeUndefined();
      // The poisoned row is gone, so a retry sees a clean unknown state
      // instead of failing until the TTL.
      const rows = await database.select().from(atprotoAuthState).all();
      expect(rows).toHaveLength(0);
    });

    it("deletes state on del (single-use consumption)", async () => {
      const store = createAtprotoStateStore(database, KEY);
      await store.set("state-key", SAVED_STATE);
      await store.del("state-key");
      expect(await store.get("state-key")).toBeUndefined();
    });
  });

  describe("session store", () => {
    it("upserts the connection with plaintext bookkeeping columns", async () => {
      const store = createAtprotoSessionStore(database, KEY);
      await store.set(DID, savedSession());

      const row = await database
        .select()
        .from(atprotoConnections)
        .where(eq(atprotoConnections.did, DID))
        .get();
      expect(row).toBeDefined();
      expect(row!.status).toBe("active");
      expect(row!.scopes).toBe("atproto");
      expect(row!.pdsUrl).toBe("https://pds.example.com");
      expect(row!.session).not.toContain("refresh-token-value");

      expect(await store.get(DID)).toEqual(savedSession());
    });

    it("replaces the stored grant atomically on re-consent", async () => {
      const store = createAtprotoSessionStore(database, KEY);
      await store.set(DID, savedSession());
      await store.set(DID, savedSession("atproto repo:write"));

      const rows = await database.select().from(atprotoConnections).all();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.scopes).toBe("atproto repo:write");
    });

    it("records an omitted scope as unknown and never clobbers a known PDS", async () => {
      const store = createAtprotoSessionStore(database, KEY);
      await store.set(DID, savedSession());

      const opaque = savedSession();
      delete (opaque as unknown as { tokenSet: Record<string, unknown> })
        .tokenSet.scope;
      delete (opaque as unknown as { tokenSet: Record<string, unknown> })
        .tokenSet.aud;
      await store.set(DID, opaque);

      const row = await database
        .select()
        .from(atprotoConnections)
        .where(eq(atprotoConnections.did, DID))
        .get();
      expect(row!.scopes).toBeNull();
      expect(row!.pdsUrl).toBe("https://pds.example.com");
    });

    it("destroys credentials but keeps the row on del", async () => {
      const store = createAtprotoSessionStore(database, KEY);
      await store.set(DID, savedSession());
      await store.del(DID);

      expect(await store.get(DID)).toBeUndefined();
      const row = await database
        .select()
        .from(atprotoConnections)
        .where(eq(atprotoConnections.did, DID))
        .get();
      expect(row!.session).toBeNull();
      expect(row!.status).toBe("disconnected");
    });

    it("treats an undecryptable session as absent (rotated key)", async () => {
      await createAtprotoSessionStore(database, KEY).set(DID, savedSession());
      const rotated = createAtprotoSessionStore(database, OTHER_KEY);
      expect(await rotated.get(DID)).toBeUndefined();
    });

    it("rejects an envelope replayed onto another DID's row", async () => {
      const store = createAtprotoSessionStore(database, KEY);
      await store.set(DID, savedSession());
      const source = await database
        .select()
        .from(atprotoConnections)
        .where(eq(atprotoConnections.did, DID))
        .get();

      await database.insert(atprotoConnections).values({
        did: OTHER_DID,
        session: source!.session,
        scopes: "atproto",
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      expect(await store.get(OTHER_DID)).toBeUndefined();
    });
  });

  describe("sweepExpiredAtprotoState", () => {
    it("removes expired state and stale unbound connections only", async () => {
      const stateStore = createAtprotoStateStore(database, KEY);
      const sessionStore = createAtprotoSessionStore(database, KEY);
      const staleDate = new Date(Date.now() - 2 * 60 * 60 * 1000);

      await stateStore.set("fresh-state", SAVED_STATE);
      await stateStore.set("expired-state", SAVED_STATE);
      await database
        .update(atprotoAuthState)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(atprotoAuthState.key, "expired-state"));

      // A bound connection (has a user) and a stale unbound one.
      await database.insert(user).values({
        id: "user-1",
        name: "user-1",
        email: "user-1@example.com",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await sessionStore.set(DID, savedSession());
      await database
        .update(atprotoConnections)
        .set({ userId: "user-1", updatedAt: staleDate })
        .where(eq(atprotoConnections.did, DID));
      // A stale unbound row that STILL holds credentials must survive: its
      // session is the only token able to revoke the PDS-side grant, and
      // the service-level sweep revokes it before this deletion applies.
      await sessionStore.set(OTHER_DID, savedSession());
      await database
        .update(atprotoConnections)
        .set({ updatedAt: staleDate })
        .where(eq(atprotoConnections.did, OTHER_DID));
      // A stale unbound row whose credentials are already destroyed is
      // deletable garbage.
      await sessionStore.set("did:plc:revokedorphan", savedSession());
      await disconnectAtprotoConnection(database, "did:plc:revokedorphan");
      await database
        .update(atprotoConnections)
        .set({ updatedAt: staleDate })
        .where(eq(atprotoConnections.did, "did:plc:revokedorphan"));

      await sweepExpiredAtprotoState(database);

      const stateKeys = (
        await database.select().from(atprotoAuthState).all()
      ).map((r) => r.key);
      expect(stateKeys).toEqual(["fresh-state"]);

      const dids = (await database.select().from(atprotoConnections).all()).map(
        (r) => r.did,
      );
      expect(dids).toHaveLength(2);
      expect(dids).toContain(DID);
      expect(dids).toContain(OTHER_DID);
    });
  });
});
