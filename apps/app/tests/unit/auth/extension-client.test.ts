import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXTENSION_REDIRECT_URIS,
  extensionOAuthClientNeedsUpdate,
} from "~/lib/extension-auth";

const EXTENSION_AUTH_SCOPES = ["openid", "profile", "offline_access"];

function extensionClient(overrides: Record<string, unknown> = {}) {
  return {
    name: "Serial browser extension",
    redirectUris: [...DEFAULT_EXTENSION_REDIRECT_URIS],
    scopes: [...EXTENSION_AUTH_SCOPES],
    tokenEndpointAuthMethod: "none",
    grantTypes: ["authorization_code", "refresh_token"],
    responseTypes: ["code"],
    public: true,
    requirePKCE: true,
    skipConsent: true,
    enableEndSession: false,
    disabled: true,
    ...overrides,
  };
}

describe("extensionOAuthClientNeedsUpdate", () => {
  it("does not write when managed configuration is unchanged", () => {
    expect(
      extensionOAuthClientNeedsUpdate(extensionClient(), extensionClient()),
    ).toBe(false);
  });

  it("ignores the operator-controlled disabled state", () => {
    expect(
      extensionOAuthClientNeedsUpdate(
        extensionClient({ disabled: false }),
        extensionClient(),
      ),
    ).toBe(false);
  });

  it("reconciles changed managed configuration", () => {
    expect(
      extensionOAuthClientNeedsUpdate(
        extensionClient({ redirectUris: [] }),
        extensionClient(),
      ),
    ).toBe(true);
  });
});
