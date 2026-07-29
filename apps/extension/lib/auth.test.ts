import { describe, expect, it } from "vitest";
import {
  DEFAULT_SERIAL_INSTANCE,
  getThemeCssVariables,
  normalizeInstanceUrl,
  originPermission,
  parseSerialTheme,
  resolveInitialInstance,
  validateAuthEndpoints,
} from "./auth";

describe("normalizeInstanceUrl", () => {
  it("defaults an instance without a scheme to HTTPS", () => {
    expect(normalizeInstanceUrl("serial.example.com")).toBe(
      "https://serial.example.com",
    );
  });

  it("keeps the default Serial instance stable", () => {
    expect(normalizeInstanceUrl(DEFAULT_SERIAL_INSTANCE)).toBe(
      DEFAULT_SERIAL_INSTANCE,
    );
  });

  it("reduces instance URLs to their origin", () => {
    expect(normalizeInstanceUrl("https://serial.example.com/library?q=1")).toBe(
      "https://serial.example.com",
    );
  });

  it("allows HTTP for local development", () => {
    expect(normalizeInstanceUrl("http://localhost:3000/auth/sign-in")).toBe(
      "http://localhost:3000",
    );
    expect(normalizeInstanceUrl("http://127.0.0.1:3000")).toBe(
      "http://127.0.0.1:3000",
    );
    expect(normalizeInstanceUrl("http://[::1]:3000")).toBe("http://[::1]:3000");
  });

  it("defaults schemeless local instances to HTTP", () => {
    expect(normalizeInstanceUrl("localhost:3005")).toBe(
      "http://localhost:3005",
    );
    expect(normalizeInstanceUrl("127.0.0.1:3005")).toBe(
      "http://127.0.0.1:3005",
    );
    expect(normalizeInstanceUrl("[::1]:3005")).toBe("http://[::1]:3005");
  });

  it("rejects insecure remote instances", () => {
    expect(() =>
      normalizeInstanceUrl("http://serial.example.com"),
    ).toThrowError("Serial instances must use HTTPS");
  });

  it("rejects embedded credentials", () => {
    expect(() =>
      normalizeInstanceUrl("https://user:secret@serial.example.com"),
    ).toThrowError("Instance addresses cannot contain credentials");
  });
});

describe("originPermission", () => {
  it("requests only the selected instance origin", () => {
    expect(originPermission("https://serial.example.com")).toBe(
      "https://serial.example.com/*",
    );
  });

  it("uses the browser match pattern for every localhost port", () => {
    expect(originPermission("http://localhost:3005")).toBe(
      "http://localhost/*",
    );
    expect(originPermission("http://127.0.0.1:3005")).toBe(
      "http://127.0.0.1/*",
    );
    expect(originPermission("http://[::1]:3005")).toBe("http://[::1]/*");
  });
});

describe("validateAuthEndpoints", () => {
  const instance = "https://alias.example.com";
  const redirectUri =
    "https://abfgpdgoffipbnfjcdoejalehhbegamc.chromiumapp.org/serial-auth";
  const issuer = `${instance}/api/auth`;
  const endpoints = {
    issuer,
    clientId: "serial-browser-extension",
    scopes: ["openid", "profile"],
    authorizationEndpoint: `${issuer}/oauth2/authorize`,
    tokenEndpoint: `${issuer}/oauth2/token`,
    revocationEndpoint: `${issuer}/oauth2/revoke`,
    userInfoEndpoint: `${issuer}/oauth2/userinfo`,
    redirectUri,
  };

  it("accepts endpoints on the selected alias", () => {
    expect(validateAuthEndpoints(`${instance}/`, redirectUri, endpoints)).toBe(
      endpoints,
    );
  });

  it("rejects endpoints on a different origin", () => {
    expect(() =>
      validateAuthEndpoints(instance, redirectUri, {
        ...endpoints,
        tokenEndpoint: "https://attacker.example.com/api/auth/oauth2/token",
      }),
    ).toThrow("unexpected authentication endpoints");
  });

  it("rejects a redirect other than the browser-provided value", () => {
    expect(() =>
      validateAuthEndpoints(instance, "https://example.com/wrong", endpoints),
    ).toThrow("unexpected authentication endpoints");
  });
});

describe("resolveInitialInstance", () => {
  it("uses the active instance only when its web session is valid", () => {
    expect(
      resolveInitialInstance({
        detectedInstance: "https://current.example.com",
        hasActiveWebSession: true,
        selectedInstance: "https://selected.example.com",
        lastInstance: "https://last.example.com",
      }),
    ).toBe("https://current.example.com");
  });

  it("requires a choice when the active instance has no web session", () => {
    expect(
      resolveInitialInstance({
        detectedInstance: "https://current.example.com",
        hasActiveWebSession: false,
        selectedInstance: "https://selected.example.com",
        lastInstance: "https://last.example.com",
      }),
    ).toBeNull();
  });

  it("uses the explicit selection before the last authenticated instance", () => {
    expect(
      resolveInitialInstance({
        detectedInstance: null,
        hasActiveWebSession: false,
        selectedInstance: "https://selected.example.com",
        lastInstance: "https://last.example.com",
      }),
    ).toBe("https://selected.example.com");
  });

  it("returns null when there is no reliable instance", () => {
    expect(
      resolveInitialInstance({
        detectedInstance: null,
        hasActiveWebSession: false,
        selectedInstance: null,
        lastInstance: null,
      }),
    ).toBeNull();
  });
});

describe("Serial theme", () => {
  it("accepts complete light and dark HSL values", () => {
    expect(
      parseSerialTheme({
        lightHSL: [210, 20, 95],
        darkHSL: [210, 25, 12],
      }),
    ).toEqual({
      lightHSL: [210, 20, 95],
      darkHSL: [210, 25, 12],
    });
  });

  it("ignores malformed theme values", () => {
    expect(
      parseSerialTheme({
        lightHSL: [210, "20%", 95],
        darkHSL: [210, 25],
      }),
    ).toBeUndefined();
  });

  it("maps HSL values to the same CSS variables used by the app", () => {
    expect(
      getThemeCssVariables({
        lightHSL: [210, 20, 95],
        darkHSL: [210, 25, 12],
      }),
    ).toEqual({
      "--light-hue": "210",
      "--light-sat": "20%",
      "--light-lgt": "95%",
      "--dark-hue": "210",
      "--dark-sat": "25%",
      "--dark-lgt": "12%",
    });
  });
});
