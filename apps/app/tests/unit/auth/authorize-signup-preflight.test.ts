import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyMigrations,
  createLocalBenchmarkTarget,
  openBenchmarkDatabase,
} from "../../../scripts/performance/database";
import { account, appConfig, user } from "~/server/db/schema";

/**
 * The authorize pre-flight for providers that resolve their account id
 * before redirecting (atproto): a DID with an existing account row is a
 * plain sign-in and always passes, while an unknown DID must clear the
 * same sign-up policy the attempt gate applies — including the first-user
 * and demo-instance bypasses — before any authorize URL is issued.
 */

const dbHolder = vi.hoisted(() => {
  const holder: { current: unknown } = { current: undefined };
  return holder;
});

const demoInstance = vi.hoisted(() => ({ current: false }));

vi.mock("~/server/db", () => ({
  get db() {
    return dbHolder.current;
  },
}));

vi.mock("~/server/auth/constants", () => ({
  getConfiguredAuthProviders: () => ["email", "atproto"],
}));

vi.mock("~/lib/demo", () => ({
  get IS_DEMO_INSTANCE() {
    return demoInstance.current;
  },
}));

const { enforceResolvedSignupPolicy } = await import("~/server/auth/policy");

type Session = ReturnType<typeof openBenchmarkDatabase>;
type Target = ReturnType<typeof createLocalBenchmarkTarget>;

const KNOWN_DID = "did:plc:knownuser";
const UNKNOWN_DID = "did:plc:strangeruser";

function preflight(accountId: string) {
  return enforceResolvedSignupPolicy({
    provider: "atproto",
    providerId: "atproto",
    accountId,
  });
}

describe("authorize sign-up pre-flight", () => {
  let session: Session;
  let target: Target;

  beforeEach(async () => {
    target = createLocalBenchmarkTarget();
    session = openBenchmarkDatabase({ url: target.url });
    await applyMigrations(session.baseClient);
    dbHolder.current = session.database;
    demoInstance.current = false;
  });

  afterEach(() => {
    session.close();
    target.cleanup();
    dbHolder.current = undefined;
  });

  async function seedExistingUser() {
    await session.database.insert(user).values({
      id: "user-existing",
      name: "existing",
      email: "existing@example.com",
      emailVerified: true,
      createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(),
    });
    await session.database.insert(account).values({
      id: "account-existing",
      accountId: KNOWN_DID,
      providerId: "atproto",
      userId: "user-existing",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async function disableSignups() {
    await session.database.insert(appConfig).values({
      key: "public-signup-enabled",
      value: "false",
      updatedAt: new Date(),
    });
  }

  it("rejects an unknown DID while sign-ups are disabled", async () => {
    await seedExistingUser();
    await disableSignups();

    await expect(preflight(UNKNOWN_DID)).rejects.toThrow(
      /Sign ups are currently disabled/,
    );
  });

  it("allows a known DID while sign-ups are disabled", async () => {
    await seedExistingUser();
    await disableSignups();

    await expect(preflight(KNOWN_DID)).resolves.toBeUndefined();
  });

  it("rejects an unknown DID when the provider is excluded from sign-up", async () => {
    await seedExistingUser();
    await session.database.insert(appConfig).values([
      {
        key: "public-signup-enabled",
        value: "true",
        updatedAt: new Date(),
      },
      {
        key: "enabled-signup-providers",
        value: JSON.stringify(["email"]),
        updatedAt: new Date(),
      },
    ]);

    await expect(preflight(UNKNOWN_DID)).rejects.toThrow(
      /Sign ups are currently disabled/,
    );
  });

  it("allows an unknown DID while atproto sign-up is available", async () => {
    await seedExistingUser();
    await session.database.insert(appConfig).values([
      {
        key: "public-signup-enabled",
        value: "true",
        updatedAt: new Date(),
      },
      {
        key: "enabled-signup-providers",
        value: JSON.stringify(["email", "atproto"]),
        updatedAt: new Date(),
      },
    ]);

    await expect(preflight(UNKNOWN_DID)).resolves.toBeUndefined();
  });

  it("allows the first user regardless of sign-up config", async () => {
    await disableSignups();

    await expect(preflight(UNKNOWN_DID)).resolves.toBeUndefined();
  });

  it("allows any DID on a demo instance", async () => {
    demoInstance.current = true;
    await seedExistingUser();
    await disableSignups();

    await expect(preflight(UNKNOWN_DID)).resolves.toBeUndefined();
  });
});
