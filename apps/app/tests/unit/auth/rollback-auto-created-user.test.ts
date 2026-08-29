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
 * exercise the real server-side deletion against a real database — no
 * mocked rollback — including the FK cascades and the session-cookie strip
 * on the failure path.
 */

const dbHolder = vi.hoisted(() => {
  const holder: { current: unknown } = { current: undefined };
  return holder;
});

const atprotoConfigured = vi.hoisted(() => ({ current: false }));

const revokeAtprotoGrantsForUser = vi.hoisted(() =>
  vi.fn().mockResolvedValue(undefined),
);

const deleteSessionCookie = vi.hoisted(() => vi.fn());

vi.mock("~/server/db", () => ({
  get db() {
    return dbHolder.current;
  },
}));

vi.mock("~/server/auth/constants", () => ({
  isAtprotoConfigured: () => atprotoConfigured.current,
}));

vi.mock("~/server/auth/atproto/service", () => ({
  revokeAtprotoGrantsForUser,
}));

vi.mock("better-auth/cookies", () => ({
  deleteSessionCookie,
}));

const { rollbackAutoCreatedUser, rollbackAutoCreatedUserFromHook } =
  await import("~/server/auth/rollback");

type Session = ReturnType<typeof openBenchmarkDatabase>;
type Target = ReturnType<typeof createLocalBenchmarkTarget>;

const DID = "did:plc:rollbacktest";

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
    deleteSessionCookie.mockClear();
  });

  afterEach(() => {
    session.close();
    target.cleanup();
    dbHolder.current = undefined;
  });

  async function seedAutoCreatedUser(id: string) {
    await session.database.insert(user).values({
      id,
      name: id,
      email: `${id}@example.invalid`,
      emailVerified: false,
      createdAt: new Date(),
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

  it("deletes the user and cascades account, session, and connection rows", async () => {
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

  it("leaves other users' rows alone", async () => {
    await seedAutoCreatedUser("user-doomed");
    await session.database.insert(user).values({
      id: "user-established",
      name: "established",
      email: "established@example.com",
      emailVerified: true,
      createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(),
    });

    await rollbackAutoCreatedUser("user-doomed");

    const remaining = await session.database.select().from(user).all();
    expect(remaining.map((row) => row.id)).toEqual(["user-established"]);
  });
});

describe("rollbackAutoCreatedUserFromHook", () => {
  const ctx = {} as never;

  afterEach(() => {
    deleteSessionCookie.mockClear();
    dbHolder.current = undefined;
  });

  it("strips the session cookie after a successful rollback", async () => {
    const target = createLocalBenchmarkTarget();
    const session = openBenchmarkDatabase({ url: target.url });
    await applyMigrations(session.baseClient);
    dbHolder.current = session.database;
    atprotoConfigured.current = false;

    try {
      await rollbackAutoCreatedUserFromHook(ctx, "user-absent");
      expect(deleteSessionCookie).toHaveBeenCalledWith(ctx);
    } finally {
      session.close();
      target.cleanup();
    }
  });

  it("strips the session cookie even when deletion fails, then rethrows", async () => {
    atprotoConfigured.current = false;
    dbHolder.current = {
      delete: () => ({
        where: () => Promise.reject(new Error("db unavailable")),
      }),
    };

    await expect(
      rollbackAutoCreatedUserFromHook(ctx, "user-any"),
    ).rejects.toThrow("db unavailable");
    expect(deleteSessionCookie).toHaveBeenCalledWith(ctx);
  });
});
