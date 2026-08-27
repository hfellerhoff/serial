import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyMigrations,
  createLocalBenchmarkTarget,
  openBenchmarkDatabase,
} from "../../../scripts/performance/database";
import {
  computeEmailVerificationExempt,
  refreshEmailVerificationExempt,
  requiresEmailVerification,
} from "~/server/auth/email-verification-policy";
import { account, user } from "~/server/db/schema";

type Session = ReturnType<typeof openBenchmarkDatabase>;
type Target = ReturnType<typeof createLocalBenchmarkTarget>;

const NOW = new Date("2026-08-27T12:00:00.000Z");

const CREDENTIAL = { providerId: "credential" };
const OAUTH = { providerId: "test-oauth" };

describe("requiresEmailVerification", () => {
  it("requires verification only for unverified, non-exempt users", () => {
    expect(
      requiresEmailVerification({
        emailVerified: false,
        emailVerificationExempt: false,
      }),
    ).toBe(true);
    expect(
      requiresEmailVerification({
        emailVerified: false,
        emailVerificationExempt: true,
      }),
    ).toBe(false);
    expect(
      requiresEmailVerification({
        emailVerified: true,
        emailVerificationExempt: false,
      }),
    ).toBe(false);
    expect(
      requiresEmailVerification({
        emailVerified: true,
        emailVerificationExempt: true,
      }),
    ).toBe(false);
  });
});

describe("computeEmailVerificationExempt", () => {
  it("does not exempt a credential user", () => {
    expect(computeEmailVerificationExempt([CREDENTIAL])).toBe(false);
  });

  it("exempts a user whose only account is an OAuth provider", () => {
    expect(computeEmailVerificationExempt([OAUTH])).toBe(true);
  });

  it("does not exempt when a credential account exists alongside OAuth", () => {
    expect(computeEmailVerificationExempt([OAUTH, CREDENTIAL])).toBe(false);
  });

  it("fails closed for a user with no accounts at all", () => {
    expect(computeEmailVerificationExempt([])).toBe(false);
  });

  it("counts a credential account even without a stored password", () => {
    expect(
      computeEmailVerificationExempt([OAUTH, { providerId: "credential" }]),
    ).toBe(false);
  });
});

describe("refreshEmailVerificationExempt", () => {
  let session: Session;
  let target: Target;

  async function seedUser(id: string, providerIds: string[]) {
    await session.database.insert(user).values({
      id,
      name: id,
      email: `${id}@example.com`,
      emailVerified: false,
      createdAt: NOW,
      updatedAt: NOW,
    });
    if (providerIds.length > 0) {
      await session.database.insert(account).values(
        providerIds.map((providerId, index) => ({
          id: `${id}-account-${index}`,
          accountId: providerId === "credential" ? id : `${providerId}-${id}`,
          providerId,
          userId: id,
          password: providerId === "credential" ? "hashed-password" : null,
          createdAt: NOW,
          updatedAt: NOW,
        })),
      );
    }
  }

  async function readExemptFlag(id: string) {
    const row = await session.database
      .select({ emailVerificationExempt: user.emailVerificationExempt })
      .from(user)
      .where(eq(user.id, id))
      .get();
    return row?.emailVerificationExempt;
  }

  beforeEach(async () => {
    target = createLocalBenchmarkTarget();
    session = openBenchmarkDatabase({ url: target.url });
    await applyMigrations(session.baseClient);
  });

  afterEach(() => {
    session.close();
    target.cleanup();
  });

  it("marks an OAuth-only user exempt", async () => {
    await seedUser("oauth-user", ["test-oauth"]);

    await refreshEmailVerificationExempt(session.database, "oauth-user");

    expect(await readExemptFlag("oauth-user")).toBe(true);
  });

  it("revokes the exemption when a credential account appears", async () => {
    await seedUser("linked-user", ["test-oauth"]);
    await refreshEmailVerificationExempt(session.database, "linked-user");
    await session.database.insert(account).values({
      id: "linked-user-credential",
      accountId: "linked-user",
      providerId: "credential",
      userId: "linked-user",
      password: "hashed-password",
      createdAt: NOW,
      updatedAt: NOW,
    });

    await refreshEmailVerificationExempt(session.database, "linked-user");

    expect(await readExemptFlag("linked-user")).toBe(false);
  });

  it("leaves a user with no accounts non-exempt", async () => {
    await seedUser("orphan-user", []);

    await refreshEmailVerificationExempt(session.database, "orphan-user");

    expect(await readExemptFlag("orphan-user")).toBe(false);
  });

  it("issues exactly two statements per refresh", async () => {
    await seedUser("bounded-user", ["credential"]);

    session.instrumentation.reset();
    await refreshEmailVerificationExempt(session.database, "bounded-user");
    expect(session.instrumentation.snapshot().statementCount).toBe(2);
  });

  it("answers the account lookup from the user_id index", async () => {
    await seedUser("indexed-user", ["credential"]);

    session.instrumentation.reset();
    await refreshEmailVerificationExempt(session.database, "indexed-user");
    const [accountLookup] = session.instrumentation.snapshot().statements;
    if (!accountLookup) throw new Error("No statement was recorded");

    const plan = await session.baseClient.execute({
      sql: `EXPLAIN QUERY PLAN ${accountLookup.sql}`,
      args: ["indexed-user"],
    });
    const planText = plan.rows.map((row) => String(row.detail)).join("\n");
    expect(planText).toContain("account_user_id_idx");
  });
});
