import { getCookies } from "better-auth/cookies";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyMigrations,
  createLocalBenchmarkTarget,
  openBenchmarkDatabase,
} from "../../../scripts/performance/database";
import {
  account,
  atprotoConnections,
  session as sessionTable,
  user,
} from "~/server/db/schema";

/**
 * The rollback that applyPostAuthPolicy relies on must actually delete the
 * auto-created rows at runtime. The previous implementation authenticated
 * Better Auth's deleteUser API with a Bearer header that core (cookie-only,
 * no bearer plugin) rejects, so it never deleted anything; these tests
 * exercise the real server-side deletion against a real database — and the
 * real deleteSessionCookie against a hook-shaped context, so a Better Auth
 * upgrade that quietly stops stripping the merged session Set-Cookie fails
 * here instead of shipping a signed-in response.
 */

const dbHolder = vi.hoisted(() => {
  const holder: { current: unknown } = { current: undefined };
  return holder;
});

const atprotoConfigured = vi.hoisted(() => ({ current: false }));

const revokeAtprotoGrantsForUser = vi.hoisted(() =>
  vi.fn().mockResolvedValue(undefined),
);

vi.mock("~/server/db", () => ({
  get db() {
    return dbHolder.current;
  },
}));

vi.mock("~/server/auth/constants", () => ({
  isAtprotoConfigured: () => atprotoConfigured.current,
  getConfiguredAuthProviders: () => ["email", "atproto"],
  getAccountProviderId: (provider: string) =>
    provider === "email" ? "credential" : provider,
}));

vi.mock("~/server/auth/atproto/service", () => ({
  revokeAtprotoGrantsForUser,
}));

const { rollbackAutoCreatedUser, rollbackAutoCreatedUserFromHook } =
  await import("~/server/auth/rollback");

type Session = ReturnType<typeof openBenchmarkDatabase>;
type Target = ReturnType<typeof createLocalBenchmarkTarget>;

const DID = "did:plc:rollbacktest";
const LIVE_SESSION_TOKEN = "live-session-token";

/**
 * A minimal after-hook context carrying what the real deleteSessionCookie
 * consumes: the response headers already holding the live session
 * Set-Cookie the endpoint merged before the hook ran, plus setCookie to
 * append expirations to those same headers.
 */
function makeHookContext() {
  const authCookies = getCookies({});
  const responseHeaders = new Headers();
  responseHeaders.append(
    "set-cookie",
    `${authCookies.sessionToken.name}=${LIVE_SESSION_TOKEN}; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax`,
  );
  const ctx = {
    headers: new Headers(),
    context: {
      authCookies,
      options: {},
      oauthConfig: {},
      logger: { warn: () => {}, debug: () => {} },
      responseHeaders,
    },
    setCookie(name: string, value: string, attributes?: { maxAge?: number }) {
      responseHeaders.append(
        "set-cookie",
        `${name}=${value}; Max-Age=${attributes?.maxAge ?? 0}`,
      );
    },
  };
  return { ctx: ctx as never, responseHeaders, authCookies };
}

function expectNoLiveSessionCookie(
  responseHeaders: Headers,
  sessionCookieName: string,
) {
  const cookies = responseHeaders.getSetCookie();
  expect(
    cookies.some((entry) =>
      entry.startsWith(`${sessionCookieName}=${LIVE_SESSION_TOKEN}`),
    ),
  ).toBe(false);
  expect(
    cookies.some(
      (entry) =>
        entry.startsWith(`${sessionCookieName}=`) &&
        entry.includes("Max-Age=0"),
    ),
  ).toBe(true);
}

describe("rollbackAutoCreatedUser", () => {
  let session: Session;
  let target: Target;

  beforeEach(async () => {
    target = createLocalBenchmarkTarget();
    session = openBenchmarkDatabase({ url: target.url });
    await applyMigrations(session.baseClient);
    dbHolder.current = session.database;
    atprotoConfigured.current = false;
    revokeAtprotoGrantsForUser.mockClear();
  });

  afterEach(() => {
    session.close();
    target.cleanup();
    dbHolder.current = undefined;
  });

  async function seedAutoCreatedUser(id: string, createdAt = new Date()) {
    await session.database.insert(user).values({
      id,
      name: id,
      email: `${id}@example.invalid`,
      emailVerified: false,
      createdAt,
      updatedAt: new Date(),
    });
    await session.database.insert(account).values({
      id: `account-${id}`,
      accountId: DID,
      providerId: "atproto",
      userId: id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await session.database.insert(sessionTable).values({
      id: `session-${id}`,
      userId: id,
      token: `token-${id}`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await session.database.insert(atprotoConnections).values({
      userId: id,
      did: DID,
      session: "encrypted-session-blob",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  it("deletes the user with account, session, and connection rows", async () => {
    await seedAutoCreatedUser("user-rollback");

    await rollbackAutoCreatedUser("user-rollback");

    expect(await session.database.select().from(user).all()).toHaveLength(0);
    expect(await session.database.select().from(account).all()).toHaveLength(0);
    expect(
      await session.database.select().from(sessionTable).all(),
    ).toHaveLength(0);
    expect(
      await session.database.select().from(atprotoConnections).all(),
    ).toHaveLength(0);
  });

  it("revokes atproto grants before deletion when atproto is configured", async () => {
    atprotoConfigured.current = true;
    await seedAutoCreatedUser("user-revoke");

    await rollbackAutoCreatedUser("user-revoke");

    expect(revokeAtprotoGrantsForUser).toHaveBeenCalledWith("user-revoke");
    expect(await session.database.select().from(user).all()).toHaveLength(0);
  });

  it("refuses to delete a user created outside the rollback window", async () => {
    await seedAutoCreatedUser(
      "user-established",
      new Date(Date.now() - 10 * 60 * 1000),
    );

    await rollbackAutoCreatedUser("user-established");

    expect(await session.database.select().from(user).all()).toHaveLength(1);
    expect(await session.database.select().from(account).all()).toHaveLength(1);
    expect(
      await session.database.select().from(sessionTable).all(),
    ).toHaveLength(1);
    expect(
      await session.database.select().from(atprotoConnections).all(),
    ).toHaveLength(1);
  });

  it("leaves other users' rows alone", async () => {
    await seedAutoCreatedUser("user-doomed");
    await session.database.insert(user).values({
      id: "user-bystander",
      name: "bystander",
      email: "bystander@example.com",
      emailVerified: true,
      createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(),
    });

    await rollbackAutoCreatedUser("user-doomed");

    const remaining = await session.database.select().from(user).all();
    expect(remaining.map((row) => row.id)).toEqual(["user-bystander"]);
  });
});

describe("rollbackAutoCreatedUserFromHook", () => {
  afterEach(() => {
    dbHolder.current = undefined;
  });

  it("deletes the user and strips the merged session cookie on success", async () => {
    const target = createLocalBenchmarkTarget();
    const session = openBenchmarkDatabase({ url: target.url });
    await applyMigrations(session.baseClient);
    dbHolder.current = session.database;
    atprotoConfigured.current = false;
    await session.database.insert(user).values({
      id: "user-hook",
      name: "user-hook",
      email: "user-hook@example.invalid",
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const { ctx, responseHeaders, authCookies } = makeHookContext();

    try {
      await rollbackAutoCreatedUserFromHook(ctx, "user-hook");
      expect(await session.database.select().from(user).all()).toHaveLength(0);
      expectNoLiveSessionCookie(responseHeaders, authCookies.sessionToken.name);
    } finally {
      session.close();
      target.cleanup();
    }
  });

  it("strips the merged session cookie even when deletion fails, then rethrows", async () => {
    atprotoConfigured.current = false;
    dbHolder.current = {
      transaction: () => Promise.reject(new Error("db unavailable")),
    };
    const { ctx, responseHeaders, authCookies } = makeHookContext();

    await expect(
      rollbackAutoCreatedUserFromHook(ctx, "user-any"),
    ).rejects.toThrow("db unavailable");
    expectNoLiveSessionCookie(responseHeaders, authCookies.sessionToken.name);
  });
});
