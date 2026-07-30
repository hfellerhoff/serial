import { describe, expect, it } from "vitest";
import {
  readExtensionBearerToken,
  validateExtensionCodeChallenge,
} from "~/lib/extension-auth";

const VALID_TOKEN = `serial_ext_${"a".repeat(43)}`;

describe("extension connection credentials", () => {
  it("accepts only a complete extension bearer token", () => {
    expect(
      readExtensionBearerToken(
        new Request("https://serial.example.com", {
          headers: { Authorization: `Bearer ${VALID_TOKEN}` },
        }),
      ),
    ).toBe(VALID_TOKEN);

    for (const authorization of [
      VALID_TOKEN,
      `Basic ${VALID_TOKEN}`,
      `Bearer ${VALID_TOKEN} trailing`,
      "Bearer serial_ext_short",
    ]) {
      expect(
        readExtensionBearerToken(
          new Request("https://serial.example.com", {
            headers: { Authorization: authorization },
          }),
        ),
      ).toBeNull();
    }
  });

  it("requires an exact SHA-256 PKCE challenge", () => {
    const challenge = "a".repeat(43);
    expect(validateExtensionCodeChallenge(challenge)).toBe(challenge);
    expect(() => validateExtensionCodeChallenge("a".repeat(42))).toThrow(
      "invalid PKCE challenge",
    );
    expect(() => validateExtensionCodeChallenge(`${"a".repeat(42)}+`)).toThrow(
      "invalid PKCE challenge",
    );
  });
});
