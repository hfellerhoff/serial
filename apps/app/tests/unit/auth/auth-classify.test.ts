import { describe, expect, it, vi } from "vitest";

/**
 * The path classifiers are the seam between Better Auth's hooks and the
 * shared policy service. Two invariants are load-bearing for the atproto
 * link design: the link callback must be excluded from both classifiers
 * (a link is neither a sign-in to gate nor a sign-up to roll back), and
 * the first registered redirect URI must stay the sign-in callback (the
 * SDK exchanges against redirect_uris[0] unless told otherwise).
 */

vi.mock("~/env", () => ({
  env: {
    PUBLIC_BASE_URL: "https://serial.test",
    BETTER_AUTH_SECRET: "test-secret",
  },
}));

const { classifyAuthRequest, classifyCompletedAuth } =
  await import("~/server/auth/classify");
const { ATPROTO_ROUTES, getAtprotoClientMetadata, getAtprotoLinkRedirectUri } =
  await import("~/server/auth/atproto/config");

describe("classifyAuthRequest", () => {
  it("classifies the atproto authorize and callback paths as sign-in", () => {
    expect(classifyAuthRequest(ATPROTO_ROUTES.authorize)).toEqual({
      provider: "atproto",
      intent: "sign-in",
    });
    expect(classifyAuthRequest(ATPROTO_ROUTES.callback)).toEqual({
      provider: "atproto",
      intent: "sign-in",
    });
  });

  it("excludes the link callback from sign-in gating", () => {
    expect(classifyAuthRequest(ATPROTO_ROUTES.linkCallback)).toBeUndefined();
  });

  it("gates the typeahead with the rest of the atproto surface", () => {
    expect(classifyAuthRequest(ATPROTO_ROUTES.typeahead)).toEqual({
      provider: "atproto",
      intent: "sign-in",
    });
  });

  it("classifies the email and oauth paths", () => {
    expect(classifyAuthRequest("/sign-up/email")).toEqual({
      provider: "email",
      intent: "sign-up",
    });
    expect(classifyAuthRequest("/sign-in/email")).toEqual({
      provider: "email",
      intent: "sign-in",
    });
    expect(classifyAuthRequest("/oauth2/callback/oidc")).toEqual({
      provider: "oauth",
      intent: "sign-in",
    });
  });
});

describe("classifyCompletedAuth", () => {
  it("classifies the atproto sign-in callback as a completed callback", () => {
    expect(classifyCompletedAuth(ATPROTO_ROUTES.callback)).toEqual({
      provider: "atproto",
      flow: "callback",
    });
  });

  it("excludes the link callback from post-auth policy", () => {
    expect(classifyCompletedAuth(ATPROTO_ROUTES.linkCallback)).toBeUndefined();
  });
});

describe("atproto client metadata", () => {
  it("keeps the sign-in callback as the default (first) redirect URI", () => {
    const metadata = getAtprotoClientMetadata();
    expect(metadata.redirect_uris[0]).toBe(
      "https://serial.test/api/auth/atproto/callback",
    );
    expect(metadata.redirect_uris).toContain(getAtprotoLinkRedirectUri());
  });
});
