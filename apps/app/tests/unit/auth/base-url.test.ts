import { oauthProvider } from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
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

function createIssuerTestAuth(trustProxyHeaders: boolean) {
  return betterAuth({
    secret: "issuer-contract-test-secret-with-sufficient-entropy",
    baseURL: config,
    advanced: { trustedProxyHeaders: trustProxyHeaders },
    plugins: [
      oauthProvider({
        loginPage: "/auth/sign-in",
        consentPage: "/auth/consent",
        scopes: ["openid"],
        disableJwtPlugin: true,
      }),
    ],
  });
}

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
          headers: {
            "X-Forwarded-Host": "alias.example.com",
            "X-Forwarded-Proto": "https",
          },
        }),
        config,
        true,
      ),
    ).toBe("https://alias.example.com/api/auth");
  });

  it("rejects unknown hosts instead of falling back", () => {
    expect(() =>
      resolveAuthBaseOrigin(
        new Request("http://internal:3000/api/extension-auth/prepare", {
          headers: {
            "X-Forwarded-Host": "attacker.example.com",
            "X-Forwarded-Proto": "https",
          },
        }),
        config,
        true,
      ),
    ).toThrow("not configured as trusted");
  });

  it("rejects incomplete or malformed trusted proxy headers", () => {
    for (const forwardedHost of [
      "alias.example.com, attacker.example.com",
      "alias.example.com/path",
    ]) {
      expect(() =>
        resolveAuthBaseOrigin(
          new Request("http://internal:3000/api/extension-auth/prepare", {
            headers: {
              "X-Forwarded-Host": forwardedHost,
              "X-Forwarded-Proto": "https",
            },
          }),
          config,
          true,
        ),
      ).toThrow("valid X-Forwarded-Host");
    }

    const ambiguousHeaders: HeadersInit[] = [
      { "X-Forwarded-Host": "alias.example.com" },
      { "X-Forwarded-Proto": "https" },
      {
        "X-Forwarded-Host": "alias.example.com",
        "X-Forwarded-Proto": "ftp",
      },
    ];
    for (const headers of ambiguousHeaders) {
      expect(() =>
        resolveAuthBaseOrigin(
          new Request("http://internal:3000/api/extension-auth/prepare", {
            headers,
          }),
          config,
          true,
        ),
      ).toThrow("valid X-Forwarded-Host");
    }
  });

  it("ignores untrusted forwarded headers", () => {
    expect(
      resolveAuthBaseOrigin(
        new Request("https://serial.example.com/api/extension-auth/prepare", {
          headers: {
            "X-Forwarded-Host": "alias.example.com",
            "X-Forwarded-Proto": "http",
          },
        }),
        config,
        false,
      ),
    ).toBe("https://serial.example.com");
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
          headers: {
            "X-Forwarded-Host": "serial-tunnel.example.com",
            "X-Forwarded-Proto": "https",
          },
        }),
        mixedConfig,
        true,
      ),
    ).toBe("https://serial-tunnel.example.com/api/auth");
  });
});

describe("preparation and Better Auth issuer contract", () => {
  const proxyAwareAuth = createIssuerTestAuth(true);

  async function getBetterAuthIssuer(headers: Headers) {
    const metadata = await proxyAwareAuth.api.getOpenIdConfig({ headers });
    return metadata.issuer;
  }

  it.each([
    {
      name: "the canonical hosted origin",
      request: new Request(
        "https://serial.example.com/api/extension-auth/prepare",
        { headers: { Host: "serial.example.com" } },
      ),
    },
    {
      name: "a trusted alias",
      request: new Request(
        "https://alias.example.com/api/extension-auth/prepare",
        { headers: { Host: "alias.example.com" } },
      ),
    },
    {
      name: "an HTTPS proxy forwarding to HTTP",
      request: new Request("http://internal:3000/api/extension-auth/prepare", {
        headers: {
          Host: "internal:3000",
          "X-Forwarded-Host": "alias.example.com",
          "X-Forwarded-Proto": "https",
        },
      }),
    },
  ])("uses one issuer for $name", async ({ request }) => {
    const preparationIssuer = getAuthIssuer(request, config, true);
    await expect(getBetterAuthIssuer(request.headers)).resolves.toBe(
      preparationIssuer,
    );
  });

  it("rejects ambiguous headers before preparation or OAuth handling", () => {
    const ambiguousHeaders: HeadersInit[] = [
      { "X-Forwarded-Host": "alias.example.com" },
      { "X-Forwarded-Proto": "https" },
      {
        "X-Forwarded-Host": "alias.example.com",
        "X-Forwarded-Proto": "not-a-protocol",
      },
    ];
    for (const headers of ambiguousHeaders) {
      const request = new Request(
        "http://internal:3000/api/extension-auth/prepare",
        { headers },
      );
      expect(() => getAuthIssuer(request, config, true)).toThrow(
        "Trusted proxy requests",
      );
    }
  });
});
