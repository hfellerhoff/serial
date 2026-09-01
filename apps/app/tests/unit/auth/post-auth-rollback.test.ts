import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyMigrations,
  createLocalBenchmarkTarget,
  openBenchmarkDatabase,
} from "../../../scripts/performance/database";
import {
  account,
  appConfig,
  session as sessionTable,
  user,
} from "~/server/db/schema";

/**
 * The auto-signup rollback in applyPostAuthPolicy must only ever delete a
 * user the callback itself just created. An established user signing in
 * through a linked provider can arrive with exactly one session (all
 * others expired), so session count alone must not trigger rollback —
 * creation recency is required too. And a just-created user reached by
 * implicit account linking (another provider's row, or several rows) is
 * not the callback's own auto-signup either, so the user's sole account
 * row must belong to the callback's provider.
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
  getAccountProviderId: (provider: string) =>
    provider === "email" ? "credential" : provider,
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

  async function insertCallbackUser(
    id: string,
    createdAt: Date,
    accountProviderIds: string[] = ["atproto"],
  ) {
    await session.database.insert(user).values({
      id,
      name: id,
      email: `${id}@example.com`,
      emailVerified: false,
      createdAt,
      updatedAt: new Date(),
    });
    for (const providerId of accountProviderIds) {
      await session.database.insert(account).values({
        id: `account-${id}-${providerId}`,
        accountId: `${providerId}-${id}`,
        providerId,
        userId: id,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
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

  it("never rolls back a just-created user the callback linked to (multiple account rows)", async () => {
    // Signed up with email moments ago, then the callback implicitly
    // linked the atproto account — a real user, not an auto-signup.
    await insertCallbackUser("user-just-linked", new Date(), [
      "credential",
      "atproto",
    ]);
    const rollback = vi.fn().mockResolvedValue(undefined);

    await applyPostAuthPolicy(completedAuth("user-just-linked", rollback));
    expect(rollback).not.toHaveBeenCalled();
  });

  it("never rolls back a just-created user whose sole account row belongs to another provider", async () => {
    // e.g. an admin-seeded credential-only row reached by a callback that
    // issued no account row of its own.
    await insertCallbackUser("user-credential-only", new Date(), [
      "credential",
    ]);
    const rollback = vi.fn().mockResolvedValue(undefined);

    await applyPostAuthPolicy(completedAuth("user-credential-only", rollback));
    expect(rollback).not.toHaveBeenCalled();
  });

  // The first-user branch is bootstrap-only: promotion and provider
  // recording belong to the request that created the first user, never to
  // their later sign-ins — and the config rows are written once, so an
  // existing configuration always wins.

  async function providerConfigs() {
    const configs = await session.database.select().from(appConfig).all();
    return {
      signin: configs.find((c) => c.key === "enabled-signin-providers")?.value,
      signup: configs.find((c) => c.key === "enabled-signup-providers")?.value,
    };
  }

  it("leaves config and role alone when the established first user signs in via callback", async () => {
    await session.database.insert(appConfig).values([
      {
        key: "enabled-signin-providers",
        value: JSON.stringify(["email"]),
        updatedAt: new Date(),
      },
      {
        key: "enabled-signup-providers",
        value: JSON.stringify(["email"]),
        updatedAt: new Date(),
      },
    ]);
    const rollback = vi.fn().mockResolvedValue(undefined);

    await applyPostAuthPolicy(completedAuth("user-first", rollback));

    expect(rollback).not.toHaveBeenCalled();
    const configs = await providerConfigs();
    expect(configs.signin).toBe(JSON.stringify(["email"]));
    expect(configs.signup).toBe(JSON.stringify(["email"]));
    const firstUser = await session.database
      .select({ role: user.role })
      .from(user)
      .where(eq(user.id, "user-first"))
      .get();
    // A demoted first admin must stay demoted.
    expect(firstUser?.role).not.toBe("admin");
  });

  it("bootstraps promotion and provider recording for a just-created first user", async () => {
    await session.database.delete(user).where(eq(user.id, "user-first"));
    await insertCallbackUser("user-boot", new Date());
    const rollback = vi.fn().mockResolvedValue(undefined);

    await applyPostAuthPolicy(completedAuth("user-boot", rollback));

    expect(rollback).not.toHaveBeenCalled();
    const configs = await providerConfigs();
    expect(configs.signin).toBe(JSON.stringify(["atproto"]));
    expect(configs.signup).toBe(JSON.stringify(["atproto"]));
    const bootUser = await session.database
      .select({ role: user.role })
      .from(user)
      .where(eq(user.id, "user-boot"))
      .get();
    expect(bootUser?.role).toBe("admin");
  });

  it("never clobbers provider config that already exists at bootstrap", async () => {
    await session.database.delete(user).where(eq(user.id, "user-first"));
    await session.database.insert(appConfig).values([
      {
        key: "enabled-signin-providers",
        value: JSON.stringify(["email", "atproto"]),
        updatedAt: new Date(),
      },
      {
        key: "enabled-signup-providers",
        value: JSON.stringify(["email"]),
        updatedAt: new Date(),
      },
    ]);
    await insertCallbackUser("user-boot", new Date());
    const rollback = vi.fn().mockResolvedValue(undefined);

    await applyPostAuthPolicy(completedAuth("user-boot", rollback));

    expect(rollback).not.toHaveBeenCalled();
    const configs = await providerConfigs();
    expect(configs.signin).toBe(JSON.stringify(["email", "atproto"]));
    expect(configs.signup).toBe(JSON.stringify(["email"]));
  });
});
