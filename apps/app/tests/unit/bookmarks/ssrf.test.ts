import { describe, expect, it } from "vitest";
import {
  isPublicIpAddress,
  validatePublicAddresses,
  validateServerCaptureUrl,
} from "~/server/bookmarks/ssrf";

describe("server capture target policy", () => {
  it("allows public unicast addresses", () => {
    expect(isPublicIpAddress("8.8.8.8")).toBe(true);
    expect(isPublicIpAddress("2606:4700:4700::1111")).toBe(true);
  });

  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.1.1",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "192.0.2.1",
    "::1",
    "fe80::1",
    "fc00::1",
    "ff02::1",
    "::",
    "::ffff:127.0.0.1",
  ])("rejects non-public address %s", (address) => {
    expect(isPublicIpAddress(address)).toBe(false);
  });

  it("limits protocols, ports, and credentials", () => {
    expect(
      validateServerCaptureUrl("https://example.com/path").toString(),
    ).toBe("https://example.com/path");
    for (const target of [
      "ftp://example.com/file",
      "https://user@example.com/",
      "https://example.com:8443/",
      "http://example.com:443/",
    ]) {
      expect(() => validateServerCaptureUrl(target)).toThrow("not allowed");
    }
  });

  it("rejects a hostname when any resolved address is non-public", () => {
    expect(() =>
      validatePublicAddresses([
        { address: "8.8.8.8", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ]),
    ).toThrow("not public");
    expect(
      validatePublicAddresses([
        { address: "8.8.8.8", family: 4 },
        { address: "2606:4700:4700::1111", family: 6 },
      ]),
    ).toHaveLength(2);
  });
});
