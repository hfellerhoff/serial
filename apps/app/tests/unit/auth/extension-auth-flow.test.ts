import { isRedirect } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPostVerificationDestination } from "~/lib/extension-auth";

vi.mock("~/server/email", () => ({
  IS_EMAIL_ENABLED: true,
  sendEmail: vi.fn(),
}));

const VALID_CONNECT_CALLBACK = `/auth/connect-extension?${new URLSearchParams({
  redirect_uri:
    "https://olpaonddchkbjpmjjfamplfaibopllam.chromiumapp.org/serial-auth",
  state: "s".repeat(43),
  code_challenge: "c".repeat(43),
  code_challenge_method: "S256",
}).toString()}`;

describe("extension authentication handoff", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", "http://127.0.0.1:8080");
    vi.stubEnv("PUBLIC_BASE_URL", "https://serial.example.com");
    vi.stubEnv("BETTER_AUTH_SECRET", "test-extension-auth-secret");
    vi.stubEnv("SKIP_ENV_VALIDATION", "false");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("resumes the connect flow after an unverified user verifies", async () => {
    const { auth, authMiddleware } = await import("~/server/auth");
    vi.spyOn(auth.api, "getSession").mockResolvedValue({
      user: { emailVerified: false },
    } as never);
    const next = vi.fn();
    const serverMiddleware = authMiddleware.options.server;
    if (!serverMiddleware) throw new Error("Auth middleware is not configured");

    let middlewareError: unknown;
    try {
      await serverMiddleware({
        context: undefined,
        handlerType: "router",
        next,
        pathname: "/auth/connect-extension",
        request: new Request(
          `https://serial.example.com${VALID_CONNECT_CALLBACK}`,
        ),
      });
    } catch (error) {
      middlewareError = error;
    }

    expect(isRedirect(middlewareError)).toBe(true);
    if (!isRedirect(middlewareError)) return;

    expect(middlewareError.options).toMatchObject({
      to: "/auth/verify-email",
      search: { callbackURL: VALID_CONNECT_CALLBACK },
    });
    const search = middlewareError.options.search as {
      callbackURL?: string;
    };
    expect(getPostVerificationDestination(search.callbackURL)).toBe(
      VALID_CONNECT_CALLBACK,
    );
    expect(next).not.toHaveBeenCalled();
  });
});
