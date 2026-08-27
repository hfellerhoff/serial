import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyMigrations,
  createLocalBenchmarkTarget,
  openBenchmarkDatabase,
} from "../../../scripts/performance/database";
import { appConfig, user } from "~/server/db/schema";

/**
 * Disabled-provider gating for the atproto provider through the shared
 * policy service: the same enforceAuthAttemptPolicy consulted by the email
 * and generic OAuth adapters, with the provider passed explicitly the way
 * the atproto plugin's paths are classified.
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

// auth/constants derives trusted origins from env at module load, which the
// unit-test env doesn't provide. Policy only consumes the configured-provider
// list from it; this instance has email configured but not atproto.
vi.mock("~/server/auth/constants", () => ({
  getConfiguredAuthProviders: () => ["email", "oauth"],
}));

const { enforceAuthAttemptPolicy } = await import("~/server/auth/policy");

type Session = ReturnType<typeof openBenchmarkDatabase>;
type Target = ReturnType<typeof createLocalBenchmarkTarget>;

describe("atproto disabled-provider gating", () => {
  let session: Session;
  let target: Target;

  beforeEach(async () => {
    target = createLocalBenchmarkTarget();
    session = openBenchmarkDatabase({ url: target.url });
    await applyMigrations(session.baseClient);
    dbHolder.current = session.database;

    // A pre-existing user so the first-user bypass does not apply.
    await session.database.insert(user).values({
      id: "existing-user",
      name: "existing",
      email: "existing@example.com",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  afterEach(() => {
    session.close();
    target.cleanup();
    dbHolder.current = undefined;
  });

  async function setConfig(key: string, value: string) {
    await session.database
      .insert(appConfig)
      .values({ key: key as never, value, updatedAt: new Date() });
  }

  it("rejects atproto sign-in when the provider is not enabled", async () => {
    await setConfig("enabled-signin-providers", '["email","oauth"]');
    await expect(
      enforceAuthAttemptPolicy({ provider: "atproto", intent: "sign-in" }),
    ).rejects.toThrow("Atmosphere sign in is currently disabled");
  });

  it("allows atproto sign-in when the provider is enabled", async () => {
    await setConfig("enabled-signin-providers", '["email","atproto"]');
    await expect(
      enforceAuthAttemptPolicy({ provider: "atproto", intent: "sign-in" }),
    ).resolves.toBeUndefined();
  });

  it("rejects atproto sign-up while the instance has atproto unconfigured", async () => {
    // Enabled in app config, but this instance has no ATPROTO_* env — the
    // configured-provider filter must still exclude it.
    await setConfig("public-signup-enabled", "true");
    await setConfig("enabled-signup-providers", '["email","atproto"]');
    await expect(
      enforceAuthAttemptPolicy({ provider: "atproto", intent: "sign-up" }),
    ).rejects.toThrow("Sign ups are currently disabled");
  });
});
