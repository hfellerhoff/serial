import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXTENSION_REDIRECT_URIS,
  parseExtensionRedirectUri,
  parseExtensionRedirectUriList,
} from "~/lib/extension-auth";

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
