import { describe, expect, it } from "vitest";
import {
  DEFAULT_SERIAL_INSTANCE,
  EXTENSION_AUTH_SESSION_VERSION,
  getThemeCssVariables,
  isSessionExpired,
  normalizeInstanceUrl,
  originPermission,
  parseConnectionResponse,
  parseSerialTheme,
  parseStoredAuthSession,
  readAuthJsonResponse,
  resolveInitialInstance,
  updateSessionFromResponse,
} from "./auth";

describe("normalizeInstanceUrl", () => {
  it("defaults remote and local instances to safe schemes", () => {
    expect(normalizeInstanceUrl("serial.example.com")).toBe(
      "https://serial.example.com",
    );
    expect(normalizeInstanceUrl("localhost:3005")).toBe(
      "http://localhost:3005",
    );
    expect(normalizeInstanceUrl(DEFAULT_SERIAL_INSTANCE)).toBe(
      DEFAULT_SERIAL_INSTANCE,
    );
  });

  it("reduces instance URLs to their origin", () => {
    expect(normalizeInstanceUrl("https://serial.example.com/library?q=1")).toBe(
      "https://serial.example.com",
    );
  });

  it("allows HTTP only for loopback development", () => {
    expect(normalizeInstanceUrl("http://127.0.0.1:3000")).toBe(
      "http://127.0.0.1:3000",
    );
    expect(normalizeInstanceUrl("http://[::1]:3000")).toBe("http://[::1]:3000");
    expect(() =>
      normalizeInstanceUrl("http://serial.example.com"),
    ).toThrowError("Serial instances must use HTTPS");
  });

  it("rejects HTTP loopback instances in production", () => {
    for (const instance of [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://[::1]:3000",
    ]) {
      expect(() =>
        normalizeInstanceUrl(instance, { allowHttpLoopback: false }),
      ).toThrowError("Serial instances must use HTTPS");
    }
  });

  it("rejects embedded credentials", () => {
    expect(() =>
      normalizeInstanceUrl("https://user:secret@serial.example.com"),
    ).toThrowError("Instance addresses cannot contain credentials");
  });
});

describe("originPermission", () => {
  it("requests only the selected host", () => {
    expect(originPermission("https://serial.example.com")).toBe(
      "https://serial.example.com/*",
    );
    expect(originPermission("http://localhost:3005")).toBe(
      "http://localhost/*",
    );
  });
});

describe("extension session responses", () => {
  const instance = "https://serial.example.com";
  const response = {
    token: "serial_ext_secret",
    expiresAt: 1_800_000_000_000,
    user: { id: "user-1", name: "Reader" },
  };

  it("parses a single scoped connection token", () => {
    expect(parseConnectionResponse(instance, response)).toEqual({
      version: EXTENSION_AUTH_SESSION_VERSION,
      instance,
      ...response,
    });
  });

  it("rejects malformed responses and stored sessions", () => {
    expect(() =>
      parseConnectionResponse(instance, { ...response, token: 42 }),
    ).toThrow("invalid connection response");
    expect(
      parseStoredAuthSession({
        version: EXTENSION_AUTH_SESSION_VERSION - 1,
        instance,
        ...response,
      }),
    ).toBeNull();
  });

  it("updates profile data without rotating the credential", () => {
    const session = parseConnectionResponse(instance, response);
    expect(
      updateSessionFromResponse(session, {
        expiresAt: response.expiresAt,
        user: { id: "user-1", name: "Updated" },
      }),
    ).toEqual({
      ...session,
      user: { id: "user-1", name: "Updated" },
    });
  });

  it("identifies expired and active sessions at a fixed instant", () => {
    const session = parseConnectionResponse(instance, response);
    expect(isSessionExpired(session, response.expiresAt)).toBe(true);
    expect(isSessionExpired(session, response.expiresAt - 1)).toBe(false);
  });

  it("reports non-JSON compatibility responses", async () => {
    const response = new Response("<html>Bad gateway</html>", { status: 502 });
    await expect(readAuthJsonResponse(response)).rejects.toThrow(
      "non-JSON response (502)",
    );
  });
});

describe("resolveInitialInstance", () => {
  it("prefers an instance detected in the current tab", () => {
    expect(
      resolveInitialInstance({
        detectedInstance: "https://current.example.com",
        selectedInstance: "https://selected.example.com",
        lastInstance: "https://last.example.com",
      }),
    ).toBe("https://current.example.com");
  });

  it("falls back to explicit and previous selections", () => {
    expect(
      resolveInitialInstance({
        detectedInstance: null,
        selectedInstance: "https://selected.example.com",
        lastInstance: "https://last.example.com",
      }),
    ).toBe("https://selected.example.com");
  });
});

describe("Serial theme", () => {
  it("accepts HSL tuples and maps them to app CSS variables", () => {
    const theme = parseSerialTheme({
      lightHSL: [210, 20, 95],
      darkHSL: [210, 25, 12],
    });
    expect(getThemeCssVariables(theme)).toEqual({
      "--light-hue": "210",
      "--light-sat": "20%",
      "--light-lgt": "95%",
      "--dark-hue": "210",
      "--dark-sat": "25%",
      "--dark-lgt": "12%",
    });
  });

  it("ignores malformed theme values", () => {
    expect(parseSerialTheme({ lightHSL: [210, "20%", 95] })).toBeUndefined();
  });
});
