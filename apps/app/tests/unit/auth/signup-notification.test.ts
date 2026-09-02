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
 * The admin "new user signed up" notification must fire only when a user
 * was actually created by the completing flow. A callback completes plain
 * sign-ins as well as auto-signups, so it notifies only when the shared
 * auto-created determination (creation recency, session count, sole
 * provider account row) holds; email sign-up always just created its
 * user. A DID-only Atmosphere sign-up notifies without surfacing the
 * internal placeholder address.
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

vi.mock("~/server/email", () => ({
  IS_EMAIL_ENABLED: true,
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

const { applyPostAuthPolicy } = await import("~/server/auth/policy");
const { sendEmail } = await import("~/server/email");

type Session = ReturnType<typeof openBenchmarkDatabase>;
type Target = ReturnType<typeof createLocalBenchmarkTarget>;

describe("admin signup notification", () => {
  let session: Session;
  let target: Target;

  beforeEach(async () => {
    vi.mocked(sendEmail).mockClear();
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
    // Sign-ups open and the notification setting enabled.
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
      {
        key: "admin-notify-on-signup",
        value: "true",
        updatedAt: new Date(),
      },
      {
        key: "admin-notify-email",
        value: "admin@example.com",
        updatedAt: new Date(),
      },
    ]);
  });

  afterEach(() => {
    session.close();
    target.cleanup();
    dbHolder.current = undefined;
  });

  async function insertCallbackUser(
    id: string,
    createdAt: Date,
    options: { email?: string; accountProviderIds?: string[] } = {},
  ) {
    await session.database.insert(user).values({
      id,
      name: id,
      email: options.email ?? `${id}@example.com`,
      emailVerified: false,
      createdAt,
      updatedAt: new Date(),
    });
    for (const providerId of options.accountProviderIds ?? ["atproto"]) {
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

  function completedAuth(
    id: string,
    flow: "sign-up" | "callback",
    options: { provider?: "email" | "atproto"; email?: string } = {},
  ) {
    return {
      provider: options.provider ?? ("atproto" as const),
      flow,
      user: { id, name: id, email: options.email ?? `${id}@example.com` },
      rollbackNewUser: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("notifies when a callback auto-creates its user", async () => {
    await insertCallbackUser("user-new", new Date());

    await applyPostAuthPolicy(completedAuth("user-new", "callback"));

    expect(sendEmail).toHaveBeenCalledOnce();
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "admin@example.com",
        subject: "New user signed up: user-new",
      }),
    );
  });

  it("does not notify when an established user signs back in via callback", async () => {
    // Linked yesterday; signing back in issues a fresh session either way.
    await insertCallbackUser(
      "user-linked",
      new Date(Date.now() - 24 * 60 * 60 * 1000),
    );

    await applyPostAuthPolicy(completedAuth("user-linked", "callback"));

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("does not notify when a callback implicitly links a just-created user", async () => {
    // Signed up with email moments ago (which notified), then the callback
    // linked the atproto account — not a second sign-up.
    await insertCallbackUser("user-just-linked", new Date(), {
      accountProviderIds: ["credential", "atproto"],
    });

    await applyPostAuthPolicy(completedAuth("user-just-linked", "callback"));

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("notifies on an email sign-up flow", async () => {
    await insertCallbackUser("user-email", new Date(), {
      accountProviderIds: ["credential"],
    });

    await applyPostAuthPolicy(
      completedAuth("user-email", "sign-up", { provider: "email" }),
    );

    expect(sendEmail).toHaveBeenCalledOnce();
  });

  it("does not notify for the first user", async () => {
    await applyPostAuthPolicy(
      completedAuth("user-first", "sign-up", {
        provider: "email",
        email: "first@example.com",
      }),
    );

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("notifies for a DID-only sign-up without surfacing the placeholder email", async () => {
    const placeholder = "did-plc-abc123.deadbeef@atproto.invalid";
    await insertCallbackUser("user-did-only", new Date(), {
      email: placeholder,
    });

    await applyPostAuthPolicy(
      completedAuth("user-did-only", "callback", { email: placeholder }),
    );

    expect(sendEmail).toHaveBeenCalledOnce();
    const [message] = vi.mocked(sendEmail).mock.calls[0]!;
    expect(message.html).not.toContain("atproto.invalid");
    expect(message.html).toContain("Not provided");
  });
});
