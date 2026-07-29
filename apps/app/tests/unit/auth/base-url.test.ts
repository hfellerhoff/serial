import { describe, expect, it } from "vitest";
import {
  createAuthBaseUrlConfig,
  getAuthIssuer,
  resolveAuthBaseOrigin,
} from "~/server/auth/base-url";

const config = createAuthBaseUrlConfig(
  "https://serial.example.com/",
  new Set(["https://alias.example.com/"]),
);

describe("extension authentication base URL", () => {
  it("normalizes the canonical URL and removes trailing slashes", () => {
    expect(config).toEqual({
      allowedHosts: ["serial.example.com", "alias.example.com"],
      allowedOrigins: [
        "https://serial.example.com",
        "https://alias.example.com",
      ],
      protocol: "auto",
      fallback: "https://serial.example.com",
    });
    expect(
      getAuthIssuer(
        new Request("https://serial.example.com/api/extension-auth/prepare"),
        config,
      ),
    ).toBe("https://serial.example.com/api/auth");
  });

  it("uses an allowlisted request alias", () => {
    expect(
      resolveAuthBaseOrigin(
        new Request("https://alias.example.com/api/extension-auth/prepare"),
        config,
      ),
    ).toBe("https://alias.example.com");
  });

  it("uses an allowlisted forwarded host from a masked proxy", () => {
    expect(
      getAuthIssuer(
        new Request("http://internal:3000/api/extension-auth/prepare", {
          headers: { "X-Forwarded-Host": "alias.example.com" },
        }),
        config,
      ),
    ).toBe("https://alias.example.com/api/auth");
  });

  it("falls back to the canonical origin for unknown or malformed hosts", () => {
    for (const forwardedHost of [
      "attacker.example.com",
      "alias.example.com, attacker.example.com",
      "alias.example.com/path",
    ]) {
      expect(
        resolveAuthBaseOrigin(
          new Request("http://internal:3000/api/extension-auth/prepare", {
            headers: { "X-Forwarded-Host": forwardedHost },
          }),
          config,
        ),
      ).toBe("https://serial.example.com");
    }
  });

  it("preserves HTTP for local development instances", () => {
    const localConfig = createAuthBaseUrlConfig(
      "http://localhost:3000/",
      new Set(["http://127.0.0.1:3000"]),
    );
    expect(
      getAuthIssuer(
        new Request("http://127.0.0.1:3000/api/extension-auth/prepare"),
        localConfig,
      ),
    ).toBe("http://127.0.0.1:3000/api/auth");
  });

  it("preserves each trusted origin's protocol", () => {
    const mixedConfig = createAuthBaseUrlConfig(
      "http://localhost:3000/",
      new Set(["https://serial-tunnel.example.com"]),
    );

    expect(
      getAuthIssuer(
        new Request(
          "https://serial-tunnel.example.com/api/extension-auth/prepare",
        ),
        mixedConfig,
      ),
    ).toBe("https://serial-tunnel.example.com/api/auth");
    expect(
      getAuthIssuer(
        new Request("http://localhost:3000/api/extension-auth/prepare"),
        mixedConfig,
      ),
    ).toBe("http://localhost:3000/api/auth");
  });

  it("uses the allowlisted protocol with forwarded hosts", () => {
    const mixedConfig = createAuthBaseUrlConfig(
      "http://localhost:3000/",
      new Set(["https://serial-tunnel.example.com"]),
    );
    expect(
      getAuthIssuer(
        new Request("http://internal:3000/api/extension-auth/prepare", {
          headers: { "X-Forwarded-Host": "serial-tunnel.example.com" },
        }),
        mixedConfig,
      ),
    ).toBe("https://serial-tunnel.example.com/api/auth");
  });
});
