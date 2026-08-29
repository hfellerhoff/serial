import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyMigrations,
  createLocalBenchmarkTarget,
  openBenchmarkDatabase,
} from "../../../scripts/performance/database";
import { atprotoConnections } from "~/server/db/schema";

/**
 * The callback leg. The SDK owns validating state, exchanging the code, and
 * verifying the DID → PDS → authorization-server chain, so these cover what
 * happens around it: a rejected callback must surface and persist nothing,
 * and an upgrade flow that comes back for a different subject must destroy
 * the session the SDK just stored rather than complete.
 */

const dbHolder = vi.hoisted(() => {
  const holder: { current: unknown } = { current: undefined };
  return holder;
});

const clientHolder = vi.hoisted(() => {
  const holder: { current: unknown } = { current: undefined };
  return holder;
});

vi.mock("~/server/db", () => ({
  get db() {
    return dbHolder.current;
  },
}));

vi.mock("~/server/auth/atproto/client", () => ({
  getAtprotoClient: () => Promise.resolve(clientHolder.current),
}));

const { finishAtprotoAuth, revokeAtprotoConnection } =
  await import("~/server/auth/atproto/service");

type Session = ReturnType<typeof openBenchmarkDatabase>;
type Target = ReturnType<typeof createLocalBenchmarkTarget>;

const DID = "did:plc:callbackuser";
const OTHER_DID = "did:plc:someoneelse";

function oauthSession(did: string) {
  return {
    did,
    signOut: vi.fn().mockResolvedValue(undefined),
    getTokenInfo: vi.fn().mockResolvedValue({ scope: "atproto" }),
  };
}

function fakeClient(options: {
  callback?: () => Promise<unknown>;
  handle?: string;
  resolveError?: Error;
}) {
  return {
    callback: options.callback ?? vi.fn(),
    oauthResolver: {
      resolveIdentity: options.resolveError
        ? vi.fn().mockRejectedValue(options.resolveError)
        : vi.fn().mockResolvedValue({ handle: options.handle ?? "user.bsky" }),
    },
  };
}

describe("finishAtprotoAuth", () => {
  let session: Session;
  let target: Target;

  beforeEach(async () => {
    target = createLocalBenchmarkTarget();
    session = openBenchmarkDatabase({ url: target.url });
    await applyMigrations(session.baseClient);
    dbHolder.current = session.database;

    // The session store has already persisted the connection by the time
    // the SDK's callback resolves.
    await session.database.insert(atprotoConnections).values({
      did: DID,
      scopes: "atproto",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  afterEach(() => {
    session.close();
    target.cleanup();
    dbHolder.current = undefined;
    clientHolder.current = undefined;
  });

  async function connectionRow() {
    const rows = await session.database.select().from(atprotoConnections).all();
    return rows[0];
  }

  it("returns the verified DID, handle, and granted scope", async () => {
    const oauth = oauthSession(DID);
    clientHolder.current = fakeClient({
      callback: vi.fn().mockResolvedValue({ session: oauth, state: null }),
      handle: "reader.bsky.social",
    });

    const result = await finishAtprotoAuth(new URLSearchParams("code=abc"));

    expect(result.did).toBe(DID);
    expect(result.handle).toBe("reader.bsky.social");
    expect(result.grantedScope).toBe("atproto");
    expect(result.linkUserId).toBeNull();
    expect((await connectionRow())?.handle).toBe("reader.bsky.social");
  });

  it("surfaces the link state's user and passes the redirect URI through", async () => {
    const oauth = oauthSession(DID);
    const callback = vi.fn().mockResolvedValue({
      session: oauth,
      state: JSON.stringify({ linkUserId: "user-1" }),
    });
    clientHolder.current = fakeClient({ callback });

    const result = await finishAtprotoAuth(new URLSearchParams("code=abc"), {
      redirectUri: "https://serial.test/api/auth/atproto/link-callback",
    });

    expect(result.linkUserId).toBe("user-1");
    // The code exchange must run against the link redirect URI, not the
    // default sign-in callback.
    expect(callback).toHaveBeenCalledWith(expect.any(URLSearchParams), {
      redirect_uri: "https://serial.test/api/auth/atproto/link-callback",
    });
  });

  it("surfaces a failed callback validation and persists nothing", async () => {
    clientHolder.current = fakeClient({
      callback: vi.fn().mockRejectedValue(new Error("Invalid state")),
    });

    await expect(
      finishAtprotoAuth(new URLSearchParams("code=replayed")),
    ).rejects.toThrow(/Invalid state/);
    expect((await connectionRow())?.handle).toBeNull();
  });

  it("surfaces a DID to PDS chain mismatch from the SDK", async () => {
    clientHolder.current = fakeClient({
      callback: vi
        .fn()
        .mockRejectedValue(
          new Error(
            "Issuer mismatch: PDS does not trust this authorization server",
          ),
        ),
    });

    await expect(
      finishAtprotoAuth(
        new URLSearchParams("code=abc&iss=https://evil.example"),
      ),
    ).rejects.toThrow(/Issuer mismatch/);
    expect((await connectionRow())?.handle).toBeNull();
  });

  it("rejects an upgrade that comes back for a different subject", async () => {
    const oauth = oauthSession(OTHER_DID);
    clientHolder.current = fakeClient({
      callback: vi.fn().mockResolvedValue({
        session: oauth,
        state: JSON.stringify({ expectedDid: DID }),
      }),
    });

    await expect(
      finishAtprotoAuth(new URLSearchParams("code=abc")),
    ).rejects.toThrow(
      `Authorization returned ${OTHER_DID} but the flow was started for ${DID}`,
    );
    // The session the SDK just stored for the wrong subject is destroyed.
    expect(oauth.signOut).toHaveBeenCalledOnce();
  });

  it("accepts an upgrade that comes back for the pinned subject", async () => {
    const oauth = oauthSession(DID);
    clientHolder.current = fakeClient({
      callback: vi.fn().mockResolvedValue({
        session: oauth,
        state: JSON.stringify({ expectedDid: DID }),
      }),
    });

    const result = await finishAtprotoAuth(new URLSearchParams("code=abc"));

    expect(result.did).toBe(DID);
    expect(oauth.signOut).not.toHaveBeenCalled();
  });

  it("treats an unresolvable handle as display data, not a failure", async () => {
    const oauth = oauthSession(DID);
    clientHolder.current = fakeClient({
      callback: vi.fn().mockResolvedValue({ session: oauth, state: null }),
      resolveError: new Error("resolution timed out"),
    });

    const result = await finishAtprotoAuth(new URLSearchParams("code=abc"));

    expect(result.did).toBe(DID);
    expect(result.handle).toBeNull();
  });

  it("ignores the placeholder handle the network returns for unresolvable identities", async () => {
    const oauth = oauthSession(DID);
    clientHolder.current = fakeClient({
      callback: vi.fn().mockResolvedValue({ session: oauth, state: null }),
      handle: "handle.invalid",
    });

    const result = await finishAtprotoAuth(new URLSearchParams("code=abc"));

    expect(result.handle).toBeNull();
    expect((await connectionRow())?.handle).toBeNull();
  });
});

describe("revokeAtprotoConnection", () => {
  let session: Session;
  let target: Target;

  beforeEach(async () => {
    target = createLocalBenchmarkTarget();
    session = openBenchmarkDatabase({ url: target.url });
    await applyMigrations(session.baseClient);
    dbHolder.current = session.database;

    await session.database.insert(atprotoConnections).values({
      did: DID,
      session: "encrypted-blob",
      scopes: "atproto",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  afterEach(() => {
    session.close();
    target.cleanup();
    dbHolder.current = undefined;
    clientHolder.current = undefined;
  });

  async function connectionRow() {
    const rows = await session.database.select().from(atprotoConnections).all();
    return rows[0];
  }

  it("disconnects even when the SDK's revoke silently returns", async () => {
    // The SDK swallows expected session errors (an unreadable blob after a
    // key rotation) and returns without touching the store.
    clientHolder.current = { revoke: vi.fn().mockResolvedValue(undefined) };

    await revokeAtprotoConnection(DID);

    const row = await connectionRow();
    expect(row?.status).toBe("disconnected");
    expect(row?.session).toBeNull();
  });

  it("disconnects when the server-side revocation throws", async () => {
    clientHolder.current = {
      revoke: vi.fn().mockRejectedValue(new Error("authorization server down")),
    };

    await expect(revokeAtprotoConnection(DID)).resolves.toBeUndefined();

    const row = await connectionRow();
    expect(row?.status).toBe("disconnected");
    expect(row?.session).toBeNull();
  });
});
