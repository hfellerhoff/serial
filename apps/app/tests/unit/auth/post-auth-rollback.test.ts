import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyMigrations,
  createLocalBenchmarkTarget,
  openBenchmarkDatabase,
} from "../../../scripts/performance/database";
import { appConfig, session as sessionTable, user } from "~/server/db/schema";

/**
 * The auto-signup rollback in applyPostAuthPolicy must only ever delete a
 * user the callback itself just created. An established user signing in
 * through a linked provider can arrive with exactly one session (all
 * others expired), so session count alone must not trigger rollback —
 * creation recency is required too.
 */

const dbHolder = vi.hoisted(() => {
  const holder: { current: unknown } = { current: undefined };
  return holder;
});

vi.mock("~/server/db", () => ({
  get db() {
    return dbHolder.current;
  },
}));

vi.mock("~/server/auth/constants", () => ({
  getConfiguredAuthProviders: () => ["email", "atproto"],
}));

const { applyPostAuthPolicy } = await import("~/server/auth/policy");

type Session = ReturnType<typeof openBenchmarkDatabase>;
type Target = ReturnType<typeof createLocalBenchmarkTarget>;

describe("post-auth callback rollback", () => {
  let session: Session;
  let target: Target;

  beforeEach(async () => {
    target = createLocalBenchmarkTarget();
    session = openBenchmarkDatabase({ url: target.url });
    await applyMigrations(session.baseClient);
    dbHolder.current = session.database;

    // An older first user so the first-user promotion branch is skipped.
    await session.database.insert(user).values({
      id: "user-first",
      name: "first",
      email: "first@example.com",
      emailVerified: true,
      createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(),
    });
    // Sign-ups fully disabled: any auto-created callback user is disallowed.
    await session.database.insert(appConfig).values({
      key: "public-signup-enabled",
      value: "false",
      updatedAt: new Date(),
    });
  });

  afterEach(() => {
    session.close();
    target.cleanup();
    dbHolder.current = undefined;
  });

  async function insertCallbackUser(id: string, createdAt: Date) {
    await session.database.insert(user).values({
      id,
      name: id,
      email: `${id}@example.com`,
      emailVerified: false,
      createdAt,
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
  }

  function completedAuth(id: string, rollbackNewUser: () => Promise<void>) {
    return {
      provider: "atproto" as const,
      flow: "callback" as const,
      user: { id, name: id, email: `${id}@example.com` },
      rollbackNewUser,
    };
  }

  it("rolls back a user the callback just auto-created", async () => {
    await insertCallbackUser("user-new", new Date());
    const rollback = vi.fn().mockResolvedValue(undefined);

    await expect(
      applyPostAuthPolicy(completedAuth("user-new", rollback)),
    ).rejects.toThrow(/Sign ups are currently disabled/);
    expect(rollback).toHaveBeenCalledOnce();
  });

  it("never rolls back an established user arriving with a single session", async () => {
    // Linked yesterday; every other session has since expired.
    await insertCallbackUser(
      "user-linked",
      new Date(Date.now() - 24 * 60 * 60 * 1000),
    );
    const rollback = vi.fn().mockResolvedValue(undefined);

    await applyPostAuthPolicy(completedAuth("user-linked", rollback));
    expect(rollback).not.toHaveBeenCalled();
  });
});
