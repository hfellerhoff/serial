import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyMigrations,
  createLocalBenchmarkTarget,
  openBenchmarkDatabase,
} from "../../../scripts/performance/database";
import { account, session as sessionTable, user } from "~/server/db/schema";

vi.mock("~/server/email", () => ({
  IS_EMAIL_ENABLED: true,
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

type Session = ReturnType<typeof openBenchmarkDatabase>;
type Target = ReturnType<typeof createLocalBenchmarkTarget>;

const SECRET = "test-session-exposure-secret";
const NOW = new Date("2026-08-27T12:00:00.000Z");

// Mirror better-call's signed-cookie format so we can hand a seeded session
// token to the real auth API.
async function signSessionCookie(token: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(token),
  );
  const base64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return encodeURIComponent(`${token}.${base64}`);
}

async function sessionHeaders(token: string) {
  const cookie = await signSessionCookie(token, SECRET);
  return new Headers({ cookie: `better-auth.session_token=${cookie}` });
}

let database: Session;
let target: Target;

async function seedUser(
  id: string,
  options?: {
    role?: string;
    emailVerified?: boolean;
    emailVerificationExempt?: boolean;
  },
) {
  await database.database.insert(user).values({
    id,
    name: id,
    email: `${id}@example.com`,
    emailVerified: options?.emailVerified ?? false,
    emailVerificationExempt: options?.emailVerificationExempt ?? false,
    role: options?.role,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

async function seedCredentialAccount(userId: string) {
  await database.database.insert(account).values({
    id: `${userId}-credential`,
    accountId: userId,
    providerId: "credential",
    userId,
    password: "seeded-password-hash",
    createdAt: NOW,
    updatedAt: NOW,
  });
}

async function seedSession(userId: string, token: string) {
  await database.database.insert(sessionTable).values({
    id: `${userId}-session`,
    token,
    userId,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

async function readCredentialPassword(userId: string) {
  const row = await database.database
    .select({ password: account.password })
    .from(account)
    .where(eq(account.id, `${userId}-credential`))
    .get();
  return row?.password;
}

beforeEach(async () => {
  target = createLocalBenchmarkTarget();
  database = openBenchmarkDatabase({ url: target.url });
  await applyMigrations(database.baseClient);

  vi.resetModules();
  vi.stubEnv("DATABASE_URL", target.url);
  // http base URL keeps the session cookie un-prefixed (no __Secure-).
  vi.stubEnv("PUBLIC_BASE_URL", "http://localhost:3000");
  vi.stubEnv("BETTER_AUTH_SECRET", SECRET);
  vi.stubEnv("SKIP_ENV_VALIDATION", "false");
});

afterEach(() => {
  vi.unstubAllEnvs();
  database.close();
  target.cleanup();
});

describe("session exposure of emailVerificationExempt", () => {
  it("returns the exemption flag on session.user from a real getSession", async () => {
    await seedUser("exempt-user", { emailVerificationExempt: true });
    await seedSession("exempt-user", "exempt-session-token");

    const { auth } = await import("~/server/auth");
    const result = await auth.api.getSession({
      headers: await sessionHeaders("exempt-session-token"),
    });

    if (!result) throw new Error("getSession returned no session");
    expect(result.user.id).toBe("exempt-user");
    expect(result.user.emailVerificationExempt).toBe(true);
    expect(result.user.emailVerified).toBe(false);
  });
});

// Password mutations flow through Better Auth's updatePassword, whose
// after-hook payload is a row count rather than an account row. An
// account.update databaseHook once crashed every one of these flows — these
// tests keep that hook from coming back.
describe("password mutation flows", () => {
  it("admin setUserPassword succeeds for a credential user", async () => {
    await seedUser("admin-user", { role: "admin", emailVerified: true });
    await seedSession("admin-user", "admin-session-token");
    await seedUser("member-user");
    await seedCredentialAccount("member-user");

    const { auth } = await import("~/server/auth");
    const result = await auth.api.setUserPassword({
      body: { userId: "member-user", newPassword: "new-member-password-1" },
      headers: await sessionHeaders("admin-session-token"),
    });

    expect(result.status).toBe(true);
    const password = await readCredentialPassword("member-user");
    expect(password).not.toBe("seeded-password-hash");
  });

  it("completes the reset-password flow via the emailed token", async () => {
    await seedUser("reset-user");
    await seedCredentialAccount("reset-user");

    const { auth } = await import("~/server/auth");
    const { sendEmail } = await import("~/server/email");
    const sendEmailMock = vi.mocked(sendEmail);
    sendEmailMock.mockClear();

    await auth.api.requestPasswordReset({
      body: { email: "reset-user@example.com", redirectTo: "/" },
    });

    const emailHtml = sendEmailMock.mock.calls[0]?.[0]?.html;
    if (typeof emailHtml !== "string") {
      throw new Error("No reset email was captured");
    }
    const token = /reset-password\/([^?"&]+)/.exec(emailHtml)?.[1];
    if (!token) throw new Error("No reset token found in the email");

    const result = await auth.api.resetPassword({
      body: { newPassword: "new-reset-password-1", token },
    });

    expect(result.status).toBe(true);
    const password = await readCredentialPassword("reset-user");
    expect(password).not.toBe("seeded-password-hash");
  });
});
