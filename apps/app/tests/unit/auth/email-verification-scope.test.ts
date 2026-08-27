import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyMigrations,
  createLocalBenchmarkTarget,
  openBenchmarkDatabase,
} from "../../../scripts/performance/database";
import { requiresEmailVerification } from "~/server/auth/verification";
import { account, user } from "~/server/db/schema";

type Session = ReturnType<typeof openBenchmarkDatabase>;
type Target = ReturnType<typeof createLocalBenchmarkTarget>;

const NOW = new Date("2026-08-27T12:00:00.000Z");

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

beforeEach(async () => {
  target = createLocalBenchmarkTarget();
  session = openBenchmarkDatabase({ url: target.url });
  await applyMigrations(session.baseClient);
});

afterEach(() => {
  session.close();
  target.cleanup();
});

describe("requiresEmailVerification", () => {
  it("requires verification for an unverified credential user", async () => {
    await seedUser("credential-user", ["credential"]);

    expect(
      await requiresEmailVerification(session.database, {
        id: "credential-user",
        emailVerified: false,
      }),
    ).toBe(true);
  });

  it("exempts an unverified user whose only account is an OAuth provider", async () => {
    await seedUser("oauth-user", ["test-oauth"]);

    expect(
      await requiresEmailVerification(session.database, {
        id: "oauth-user",
        emailVerified: false,
      }),
    ).toBe(false);
  });

  it("requires verification when a credential account exists alongside OAuth", async () => {
    await seedUser("linked-user", ["test-oauth", "credential"]);

    expect(
      await requiresEmailVerification(session.database, {
        id: "linked-user",
        emailVerified: false,
      }),
    ).toBe(true);
  });

  it("exempts an unverified user with no accounts at all", async () => {
    await seedUser("orphan-user", []);

    expect(
      await requiresEmailVerification(session.database, {
        id: "orphan-user",
        emailVerified: false,
      }),
    ).toBe(false);
  });

  it("short-circuits verified users without querying the database", async () => {
    await seedUser("verified-user", ["credential"]);

    session.instrumentation.reset();
    expect(
      await requiresEmailVerification(session.database, {
        id: "verified-user",
        emailVerified: true,
      }),
    ).toBe(false);
    expect(session.instrumentation.snapshot().statementCount).toBe(0);
  });

  it("issues exactly one indexed statement for unverified users", async () => {
    await seedUser("single-query-user", ["credential"]);

    session.instrumentation.reset();
    await requiresEmailVerification(session.database, {
      id: "single-query-user",
      emailVerified: false,
    });
    expect(session.instrumentation.snapshot().statementCount).toBe(1);
  });
});
