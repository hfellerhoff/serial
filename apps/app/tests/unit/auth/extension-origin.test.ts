import { describe, expect, it } from "vitest";
import {
  getExtensionPrepareOrigin,
  getTrustedExtensionAuthOrigin,
} from "~/server/auth/extension-origin";

const CHROME_ORIGIN = "chrome-extension://abfgpdgoffipbnfjcdoejalehhbegamc";

function extensionRequest(path: string, origin?: string) {
  return new Request(`https://app.serial.tube${path}`, {
    headers: origin ? { Origin: origin } : undefined,
  });
}

describe("getTrustedExtensionAuthOrigin", () => {
  it("trusts only the registered Chromium extension", () => {
    expect(
      getTrustedExtensionAuthOrigin(
        extensionRequest("/api/auth/oauth2/token", CHROME_ORIGIN),
      ),
    ).toBe(CHROME_ORIGIN);
    expect(
      getTrustedExtensionAuthOrigin(
        extensionRequest(
          "/api/auth/oauth2/token",
          "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        ),
      ),
    ).toBeNull();
    expect(
      getTrustedExtensionAuthOrigin(
        extensionRequest("/api/auth/sign-out", CHROME_ORIGIN),
      ),
    ).toBeNull();
  });

  it("limits Firefox extension origins to extension OAuth endpoints", () => {
    const firefoxOrigin = "moz-extension://test-install-uuid";

    for (const path of [
      "/api/auth/oauth2/token",
      "/api/auth/oauth2/revoke",
      "/api/auth/oauth2/userinfo",
    ]) {
      expect(
        getTrustedExtensionAuthOrigin(extensionRequest(path, firefoxOrigin)),
      ).toBe(firefoxOrigin);
    }

    expect(
      getTrustedExtensionAuthOrigin(
        extensionRequest("/api/auth/sign-out", firefoxOrigin),
      ),
    ).toBeNull();
  });

  it("rejects missing and malformed origins", () => {
    expect(
      getTrustedExtensionAuthOrigin(extensionRequest("/api/auth/oauth2/token")),
    ).toBeNull();
    expect(
      getTrustedExtensionAuthOrigin(
        extensionRequest("/api/auth/oauth2/token", "not-an-origin"),
      ),
    ).toBeNull();
  });

  it("allows extension origins to prepare authentication", () => {
    expect(
      getExtensionPrepareOrigin(
        extensionRequest("/api/extension-auth/prepare", CHROME_ORIGIN),
      ),
    ).toBe(CHROME_ORIGIN);
    expect(
      getExtensionPrepareOrigin(
        extensionRequest(
          "/api/extension-auth/prepare",
          "moz-extension://test-install-uuid",
        ),
      ),
    ).toBe("moz-extension://test-install-uuid");
    expect(
      getExtensionPrepareOrigin(
        extensionRequest(
          "/api/extension-auth/prepare",
          "https://attacker.example.com",
        ),
      ),
    ).toBeNull();
  });
});
