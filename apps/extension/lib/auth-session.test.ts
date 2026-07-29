import { describe, expect, it, vi } from "vitest";
import {
  EXTENSION_AUTH_SESSION_VERSION,
  SERIAL_EXTENSION_AUTH_SCOPES,
  SERIAL_EXTENSION_CLIENT_ID,
} from "./auth";
import type { ExtensionAuthSession } from "./auth";
import { createRefreshSessionSingleFlight } from "./auth-session";

class InvalidSessionError extends Error {}

function session(refreshToken: string): ExtensionAuthSession {
  const instance = "https://serial.example.com";
  const issuer = `${instance}/api/auth`;
  return {
    version: EXTENSION_AUTH_SESSION_VERSION,
    instance,
    accessToken: `access-${refreshToken}`,
    refreshToken,
    expiresAt: 1,
    endpoints: {
      issuer,
      clientId: SERIAL_EXTENSION_CLIENT_ID,
      scopes: SERIAL_EXTENSION_AUTH_SCOPES,
      authorizationEndpoint: `${issuer}/oauth2/authorize`,
      tokenEndpoint: `${issuer}/oauth2/token`,
      revocationEndpoint: `${issuer}/oauth2/revoke`,
      userInfoEndpoint: `${issuer}/oauth2/userinfo`,
      redirectUri: "https://extension.chromiumapp.org/serial-auth",
    },
    user: { id: "user-1" },
  };
}

describe("refresh session single-flight", () => {
  it("shares refresh-token rotation between concurrent callers", async () => {
    let finishRefresh: ((value: ExtensionAuthSession) => void) | undefined;
    const refresh = vi.fn(
      () =>
        new Promise<ExtensionAuthSession>((resolve) => {
          finishRefresh = resolve;
        }),
    );
    const original = session("old-token");
    const rotated = session("new-token");
    const refreshOrKeep = createRefreshSessionSingleFlight({
      refresh,
      readStoredSession: () => Promise.resolve(original),
      clearStoredSession: vi.fn(),
      isInvalidSessionError: (error) => error instanceof InvalidSessionError,
    });

    const firstRequest = refreshOrKeep(original);
    const secondRequest = refreshOrKeep(original);
    expect(refresh).toHaveBeenCalledTimes(1);

    finishRefresh?.(rotated);
    await expect(firstRequest).resolves.toBe(rotated);
    await expect(secondRequest).resolves.toBe(rotated);
  });

  it("does not let a stale invalid_grant clear rotated credentials", async () => {
    const clearStoredSession = vi.fn(() => Promise.resolve());
    const original = session("old-token");
    const rotated = session("new-token");
    const refreshOrKeep = createRefreshSessionSingleFlight({
      refresh: () => Promise.reject(new InvalidSessionError("invalid_grant")),
      readStoredSession: () => Promise.resolve(rotated),
      clearStoredSession,
      isInvalidSessionError: (error) => error instanceof InvalidSessionError,
    });

    await expect(refreshOrKeep(original)).resolves.toBeNull();
    expect(clearStoredSession).not.toHaveBeenCalled();
  });

  it("clears credentials when the rejected token is still current", async () => {
    const clearStoredSession = vi.fn(() => Promise.resolve());
    const original = session("old-token");
    const refreshOrKeep = createRefreshSessionSingleFlight({
      refresh: () => Promise.reject(new InvalidSessionError("invalid_grant")),
      readStoredSession: () => Promise.resolve(original),
      clearStoredSession,
      isInvalidSessionError: (error) => error instanceof InvalidSessionError,
    });

    await expect(refreshOrKeep(original)).resolves.toBeNull();
    expect(clearStoredSession).toHaveBeenCalledTimes(1);
  });
});
