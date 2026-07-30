import { describe, expect, it } from "vitest";
import {
  CHROME_EXTENSION_ID,
  CHROME_EXTENSION_MANIFEST_KEY,
  EXTENSION_IDENTITY_REDIRECT_URIS,
  FIREFOX_EXTENSION_ID,
} from "@serial/extension-identity";

function bytesToChromeExtensionId(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => String.fromCharCode(97 + (byte >> 4), 97 + (byte & 0x0f)))
    .join("");
}

async function digest(algorithm: AlgorithmIdentifier, value: Uint8Array) {
  const buffer = new ArrayBuffer(value.byteLength);
  new Uint8Array(buffer).set(value);
  return new Uint8Array(await crypto.subtle.digest(algorithm, buffer));
}

describe("browser extension identity", () => {
  it("derives the registered Chrome ID from the manifest key", async () => {
    const publicKey = Uint8Array.from(
      atob(CHROME_EXTENSION_MANIFEST_KEY),
      (character) => character.charCodeAt(0),
    );
    const extensionId = bytesToChromeExtensionId(
      (await digest("SHA-256", publicKey)).slice(0, 16),
    );

    expect(extensionId).toBe(CHROME_EXTENSION_ID);
    expect(EXTENSION_IDENTITY_REDIRECT_URIS.chrome).toBe(
      `https://${extensionId}.chromiumapp.org/serial-auth`,
    );
  });

  it("derives the registered Firefox redirect from the explicit add-on ID", async () => {
    const idHash = Array.from(
      await digest("SHA-1", new TextEncoder().encode(FIREFOX_EXTENSION_ID)),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");

    expect(EXTENSION_IDENTITY_REDIRECT_URIS.firefox).toBe(
      `https://${idHash}.extensions.allizom.org/serial-auth`,
    );
  });
});
