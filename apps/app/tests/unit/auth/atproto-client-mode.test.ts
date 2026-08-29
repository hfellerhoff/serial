import { describe, expect, it, vi } from "vitest";

/**
 * The client-mode seam behind atproto soft-disable and the dev loopback
 * client: PUBLIC_BASE_URL alone decides whether this instance runs the
 * confidential client (https), the RFC 8252 loopback development client
 * (plain-http loopback outside production), or no client at all — in which
 * case isAtprotoConfigured() must report false even with both keys set, so
 * no surface renders flows the SDK would reject at construction.
 */

interface MockEnv {
  PUBLIC_BASE_URL: string;
  NODE_ENV: "development" | "test" | "production";
  LOG_LEVEL: "error" | "warning" | "info" | "debug";
  TRUSTED_ORIGINS: string[];
  COOKIE_DOMAIN?: string;
  ATPROTO_CLIENT_PRIVATE_KEYS?: string;
  ATPROTO_STORE_ENCRYPTION_KEY?: string;
  SENTRY_DSN_BACKEND?: string;
}

const envHolder = vi.hoisted(() => {
  const holder: { current: MockEnv } = {
    current: {
      PUBLIC_BASE_URL: "https://serial.example",
      NODE_ENV: "development",
      LOG_LEVEL: "error",
      TRUSTED_ORIGINS: [],
    },
  };
  return holder;
});

vi.mock("~/env", () => ({
  get env() {
    return envHolder.current;
  },
}));

const { getAtprotoClientMode } = await import("~/server/auth/atproto/mode");
const { getAtprotoClientMetadata } = await import(
  "~/server/auth/atproto/config"
);
const { isAtprotoConfigured } = await import("~/server/auth/constants");

function setEnv(overrides: Partial<MockEnv>) {
  envHolder.current = { ...envHolder.current, ...overrides };
}

describe("getAtprotoClientMode", () => {
  it("is confidential for an https non-loopback base URL", () => {
    setEnv({ PUBLIC_BASE_URL: "https://serial.tube", NODE_ENV: "production" });
    expect(getAtprotoClientMode()).toBe("confidential");
  });

  it("is loopback for plain-http loopback base URLs", () => {
    for (const base of [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://[::1]:3000",
    ]) {
      setEnv({ PUBLIC_BASE_URL: base, NODE_ENV: "development" });
      expect(getAtprotoClientMode()).toBe("loopback");
    }
  });

  it("selects loopback regardless of NODE_ENV — a loopback base URL is machine-local", () => {
    // The e2e production-preview servers run production builds on a
    // localhost base URL and must keep the loopback client.
    setEnv({ PUBLIC_BASE_URL: "http://localhost:3000", NODE_ENV: "production" });
    expect(getAtprotoClientMode()).toBe("loopback");
  });

  it("is unavailable for http non-loopback, https loopback, and malformed base URLs", () => {
    const cases: Array<[MockEnv["PUBLIC_BASE_URL"], MockEnv["NODE_ENV"]]> = [
      // The SDK rejects non-loopback http metadata even in development.
      ["http://serial.internal:3000", "development"],
      // The SDK forbids https on loopback hosts outright.
      ["https://localhost:3000", "development"],
      ["not a url", "development"],
    ];
    for (const [base, nodeEnv] of cases) {
      setEnv({ PUBLIC_BASE_URL: base, NODE_ENV: nodeEnv });
      expect(getAtprotoClientMode()).toBe("unavailable");
    }
  });
});

describe("getAtprotoClientMetadata in loopback mode", () => {
  it("builds the RFC 8252 loopback public client with 127.0.0.1 redirect URIs", () => {
    setEnv({ PUBLIC_BASE_URL: "http://localhost:3000", NODE_ENV: "development" });
    const metadata = getAtprotoClientMetadata();

    expect(metadata.client_id?.startsWith("http://localhost?")).toBe(true);
    expect(metadata.token_endpoint_auth_method).toBe("none");
    // Order matters: the SDK defaults to the first entry, the sign-in
    // callback; the mapped host keeps "localhost" out of the redirect URIs.
    expect(metadata.redirect_uris).toEqual([
      "http://127.0.0.1:3000/api/auth/atproto/callback",
      "http://127.0.0.1:3000/api/auth/atproto/link-callback",
    ]);
    expect(metadata.scope).toBe("atproto");
    expect(metadata.jwks_uri).toBeUndefined();
  });

  it("keeps the confidential shape on https base URLs", () => {
    setEnv({ PUBLIC_BASE_URL: "https://serial.tube", NODE_ENV: "production" });
    const metadata = getAtprotoClientMetadata();

    expect(metadata.client_id).toBe(
      "https://serial.tube/api/auth/atproto/client-metadata.json",
    );
    expect(metadata.token_endpoint_auth_method).toBe("private_key_jwt");
    expect(metadata.redirect_uris).toEqual([
      "https://serial.tube/api/auth/atproto/callback",
      "https://serial.tube/api/auth/atproto/link-callback",
    ]);
  });
});

describe("isAtprotoConfigured soft-disable", () => {
  const keys = {
    ATPROTO_CLIENT_PRIVATE_KEYS: "[]",
    ATPROTO_STORE_ENCRYPTION_KEY: "x",
  };

  it("is false without the key pair regardless of base URL", () => {
    setEnv({
      PUBLIC_BASE_URL: "https://serial.tube",
      NODE_ENV: "production",
      ATPROTO_CLIENT_PRIVATE_KEYS: undefined,
      ATPROTO_STORE_ENCRYPTION_KEY: undefined,
    });
    expect(isAtprotoConfigured()).toBe(false);
  });

  it("is false when keys are set but no client mode is viable", () => {
    setEnv({
      ...keys,
      PUBLIC_BASE_URL: "http://serial.internal:3000",
      NODE_ENV: "production",
    });
    expect(isAtprotoConfigured()).toBe(false);
  });

  it("is true with keys and a viable mode, confidential or loopback", () => {
    setEnv({
      ...keys,
      PUBLIC_BASE_URL: "https://serial.tube",
      NODE_ENV: "production",
    });
    expect(isAtprotoConfigured()).toBe(true);

    setEnv({
      ...keys,
      PUBLIC_BASE_URL: "http://localhost:3000",
      NODE_ENV: "development",
    });
    expect(isAtprotoConfigured()).toBe(true);
  });
});
