import { describe, expect, it } from "vitest";
import {
  getAdminSigninMethods,
  wouldDisableSoleAdminSigninMethod,
} from "~/lib/constants";

/**
 * Lockout accounting for admin sign-in methods: getAdminSigninMethods is
 * the shared per-admin method derivation behind both the required-method
 * read path (getPublicSignupSetting) and the disable guard
 * (setEnabledSigninProviders). An admin whose only account row is an
 * atproto DID must count as atproto-only, so disabling Atmosphere for
 * them is refused rather than silently locking them out.
 */

const OAUTH_PROVIDER_ID = "test-oauth";

describe("getAdminSigninMethods", () => {
  it("counts credential, oauth, and atproto rows per admin", () => {
    const methods = getAdminSigninMethods({
      adminUserIds: ["a1", "a2", "a3"],
      accountRows: [
        { userId: "a1", providerId: "credential" },
        { userId: "a2", providerId: OAUTH_PROVIDER_ID },
        { userId: "a3", providerId: "atproto" },
      ],
      oauthProviderId: OAUTH_PROVIDER_ID,
      atprotoConfigured: true,
    });
    expect(methods).toEqual([["email"], ["oauth"], ["atproto"]]);
  });

  it("gives an atproto-only admin a non-empty method list", () => {
    // The regression this guards: an empty list made every provider-settings
    // change throw the lockout error for such an admin.
    const [methods] = getAdminSigninMethods({
      adminUserIds: ["a1"],
      accountRows: [{ userId: "a1", providerId: "atproto" }],
      oauthProviderId: undefined,
      atprotoConfigured: true,
    });
    expect(methods).toEqual(["atproto"]);
  });

  it("lists every method for a fully linked admin", () => {
    const [methods] = getAdminSigninMethods({
      adminUserIds: ["a1"],
      accountRows: [
        { userId: "a1", providerId: "credential" },
        { userId: "a1", providerId: OAUTH_PROVIDER_ID },
        { userId: "a1", providerId: "atproto" },
      ],
      oauthProviderId: OAUTH_PROVIDER_ID,
      atprotoConfigured: true,
    });
    expect(methods).toEqual(["email", "oauth", "atproto"]);
  });

  it("ignores atproto rows when atproto is not configured", () => {
    const [methods] = getAdminSigninMethods({
      adminUserIds: ["a1"],
      accountRows: [
        { userId: "a1", providerId: "credential" },
        { userId: "a1", providerId: "atproto" },
      ],
      oauthProviderId: undefined,
      atprotoConfigured: false,
    });
    expect(methods).toEqual(["email"]);
  });

  it("ignores oauth rows when no oauth provider id is configured", () => {
    const [methods] = getAdminSigninMethods({
      adminUserIds: ["a1"],
      accountRows: [
        { userId: "a1", providerId: "credential" },
        { userId: "a1", providerId: "some-oauth" },
      ],
      oauthProviderId: undefined,
      atprotoConfigured: true,
    });
    expect(methods).toEqual(["email"]);
  });

  it("keeps admins with no account rows at an empty list", () => {
    const [methods] = getAdminSigninMethods({
      adminUserIds: ["a1"],
      accountRows: [],
      oauthProviderId: OAUTH_PROVIDER_ID,
      atprotoConfigured: true,
    });
    expect(methods).toEqual([]);
  });
});

describe("wouldDisableSoleAdminSigninMethod", () => {
  it("refuses to disable an admin's only method", () => {
    expect(
      wouldDisableSoleAdminSigninMethod([["atproto"]], ["email", "oauth"]),
    ).toBe(true);
  });

  it("allows disabling a method every admin can do without", () => {
    expect(
      wouldDisableSoleAdminSigninMethod(
        [["email", "atproto"], ["email"]],
        ["email"],
      ),
    ).toBe(false);
  });

  it("skips admins with no working sign-in method", () => {
    // A zero-method admin (their provider's env configuration is gone)
    // can't be locked out further; refusing on their behalf would reject
    // every change, including widening ones.
    expect(wouldDisableSoleAdminSigninMethod([[], ["email"]], ["email"])).toBe(
      false,
    );
  });
});
