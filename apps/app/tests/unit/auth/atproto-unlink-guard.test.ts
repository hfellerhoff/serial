import { createRouterClient } from "@orpc/server";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyMigrations,
  createLocalBenchmarkTarget,
  openBenchmarkDatabase,
} from "../../../scripts/performance/database";
import type { ORPCContext } from "~/server/orpc/base";
import { account, atprotoConnections, user } from "~/server/db/schema";

/**
 * The ConnectionsDialog procedures: unlink must refuse to remove the
 * user's sole sign-in method, and a second link attempt while connected is
 * rejected before any OAuth round trip starts.
 */

const testState = vi.hoisted(
  (): { database: unknown; oauthConfigured: boolean } => ({
    database: undefined,
    oauthConfigured: false,
  }),
);

const revokeMock = vi.hoisted(() => vi.fn());

vi.mock("~/server/db", () => ({
  get db() {
    return testState.database;
  },
}));
vi.mock("~/server/auth", () => ({ auth: {} }));
vi.mock("~/server/auth/constants", () => ({
  isAtprotoConfigured: () => true,
  isOAuthConfigured: () => testState.oauthConfigured,
}));
vi.mock("~/server/auth/atproto/client", () => ({
  getAtprotoClient: async () => ({ revoke: revokeMock }),
}));
vi.mock("~/env", () => ({
  env: {
    OAUTH_PROVIDER_ID: "oidc",
    PUBLIC_BASE_URL: "https://serial.test",
  },
}));

const atprotoRouter = await import("~/server/api/routers/atprotoRouter");

type Session = ReturnType<typeof openBenchmarkDatabase>;
type Target = ReturnType<typeof createLocalBenchmarkTarget>;

const DID = "did:plc:guarded";

describe("atproto connection procedures", () => {
  let session: Session;
  let target: Target;

  beforeEach(async () => {
    target = createLocalBenchmarkTarget();
    session = openBenchmarkDatabase({ url: target.url });
    await applyMigrations(session.baseClient);
    testState.database = session.database;
    testState.oauthConfigured = false;
    revokeMock.mockReset();

    await session.database.insert(user).values({
      id: "user-1",
      name: "user-1",
      email: "user-1@example.com",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  afterEach(() => {
    session.close();
    target.cleanup();
    testState.database = undefined;
  });

  function api() {
    return createRouterClient(
      { atproto: atprotoRouter },
      {
        context: {
          headers: new Headers(),
          session: { id: "session-1" },
          user: { id: "user-1" },
          db: session.database,
        } as unknown as ORPCContext,
      },
    );
  }

  async function seedLinked(options?: { extraProviderId?: string }) {
    await session.database.insert(account).values({
      id: "acc-atproto",
      accountId: DID,
      providerId: "atproto",
      userId: "user-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    if (options?.extraProviderId) {
      await session.database.insert(account).values({
        id: "acc-extra",
        accountId: "extra-account",
        providerId: options.extraProviderId,
        userId: "user-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    await session.database.insert(atprotoConnections).values({
      did: DID,
      userId: "user-1",
      session: "ciphertext",
      scopes: "atproto",
      handle: "guarded.example.com",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async function atprotoAccountRows() {
    return session.database
      .select()
      .from(account)
      .where(eq(account.providerId, "atproto"))
      .all();
  }

  it("reports the connected handle", async () => {
    await seedLinked({ extraProviderId: "credential" });
    const status = await api().atproto.getConnectionStatus();
    expect(status).toEqual({
      isConnected: true,
      handle: "guarded.example.com",
      isConfigured: true,
    });
  });

  it("refuses to unlink the sole sign-in method", async () => {
    await seedLinked();
    await expect(api().atproto.unlinkAccount()).rejects.toThrow(
      /only way to sign in/,
    );
    expect(await atprotoAccountRows()).toHaveLength(1);
    expect(revokeMock).not.toHaveBeenCalled();
  });

  it("unlinks when a password credential remains", async () => {
    await seedLinked({ extraProviderId: "credential" });
    await api().atproto.unlinkAccount();

    expect(revokeMock).toHaveBeenCalledWith(DID);
    expect(await atprotoAccountRows()).toHaveLength(0);
    const status = await api().atproto.getConnectionStatus();
    expect(status.isConnected).toBe(false);
  });

  it("counts a generic OAuth account only while that provider is configured", async () => {
    await seedLinked({ extraProviderId: "oidc" });

    // Provider env has since been removed: the OAuth row is unusable.
    testState.oauthConfigured = false;
    await expect(api().atproto.unlinkAccount()).rejects.toThrow(
      /only way to sign in/,
    );

    testState.oauthConfigured = true;
    await api().atproto.unlinkAccount();
    expect(await atprotoAccountRows()).toHaveLength(0);
  });

  it("rejects starting a link while already connected", async () => {
    await seedLinked({ extraProviderId: "credential" });
    await expect(
      api().atproto.linkAccount({ identifier: "someone.example.com" }),
    ).rejects.toThrow(/already have an Atmosphere account/);
  });
});
