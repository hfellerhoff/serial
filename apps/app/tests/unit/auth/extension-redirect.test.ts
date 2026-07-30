import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXTENSION_REDIRECT_URIS,
  getExtensionConnectCallbackFromRequestUrl,
  getPostVerificationDestination,
  parseExtensionConnectCallback,
  parseExtensionRedirectUri,
  parseExtensionRedirectUriList,
} from "~/lib/extension-auth";

const VALID_CONNECT_SEARCH = new URLSearchParams({
  redirect_uri:
    "https://abfgpdgoffipbnfjcdoejalehhbegamc.chromiumapp.org/serial-auth",
  state: "s".repeat(43),
  code_challenge: "c".repeat(43),
  code_challenge_method: "S256",
}).toString();

describe("Serial extension redirect URIs", () => {
  it("accepts browser identity redirect URIs", () => {
    for (const redirectUri of DEFAULT_EXTENSION_REDIRECT_URIS) {
      expect(parseExtensionRedirectUri(redirectUri)).toBe(redirectUri);
    }
  });

  it.each([
    "not-a-url",
    "http://abfgpdgoffipbnfjcdoejalehhbegamc.chromiumapp.org/serial-auth",
    "https://example.com/serial-auth",
    "https://abfgpdgoffipbnfjcdoejalehhbegamc.chromiumapp.org/wrong-path",
    "https://abfgpdgoffipbnfjcdoejalehhbegamc.chromiumapp.org/serial-auth?next=x",
    "https://user:password@abfgpdgoffipbnfjcdoejalehhbegamc.chromiumapp.org/serial-auth",
  ])("rejects %s", (redirectUri) => {
    expect(() => parseExtensionRedirectUri(redirectUri)).toThrow(
      "Invalid Serial extension redirect URI",
    );
  });

  it("trims and deduplicates configured redirects", () => {
    const redirectUri = DEFAULT_EXTENSION_REDIRECT_URIS[0];
    expect(
      parseExtensionRedirectUriList(` ${redirectUri},${redirectUri} `),
    ).toEqual([redirectUri]);
  });
});

describe("Serial extension connection callbacks", () => {
  it("preserves a valid callback from the current request", () => {
    const callback = `/auth/connect-extension?${VALID_CONNECT_SEARCH}`;

    expect(
      getExtensionConnectCallbackFromRequestUrl(
        `https://serial.example.com${callback}`,
      ),
    ).toBe(callback);
    expect(getPostVerificationDestination(callback)).toBe(callback);
  });

  it("uses the normal signed-in destination without a callback", () => {
    expect(getPostVerificationDestination(undefined)).toBe("/");
  });

  it.each([
    "/",
    "/auth/connect-extension",
    "/auth/connect-extension?state=invalid",
    `https://example.com/auth/connect-extension?${VALID_CONNECT_SEARCH}`,
  ])("rejects invalid callback %s", (callback) => {
    expect(parseExtensionConnectCallback(callback)).toBeNull();
  });
});
