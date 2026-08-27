import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyMigrations,
  createLocalBenchmarkTarget,
  openBenchmarkDatabase,
} from "../../../scripts/performance/database";
import { session as sessionTable, user } from "~/server/db/schema";

type Session = ReturnType<typeof openBenchmarkDatabase>;
type Target = ReturnType<typeof createLocalBenchmarkTarget>;

const SECRET = "test-session-exposure-secret";
const NOW = new Date("2026-08-27T12:00:00.000Z");

// Mirror better-call's signed-cookie format so we can hand a seeded session
// token to the real auth.api.getSession.
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

let database: Session;
let target: Target;

describe("session exposure of emailVerificationExempt", () => {
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

  it("returns the exemption flag on session.user from a real getSession", async () => {
    await database.database.insert(user).values({
      id: "exempt-user",
      name: "exempt-user",
      email: "exempt-user@example.com",
      emailVerified: false,
      emailVerificationExempt: true,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await database.database.insert(sessionTable).values({
      id: "exempt-session",
      token: "exempt-session-token",
      userId: "exempt-user",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const { auth } = await import("~/server/auth");
    const cookie = await signSessionCookie("exempt-session-token", SECRET);
    const result = await auth.api.getSession({
      headers: new Headers({
        cookie: `better-auth.session_token=${cookie}`,
      }),
    });

    if (!result) throw new Error("getSession returned no session");
    expect(result.user.id).toBe("exempt-user");
    expect(result.user.emailVerificationExempt).toBe(true);
    expect(result.user.emailVerified).toBe(false);
  });
});
