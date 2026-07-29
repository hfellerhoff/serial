import { describe, expect, it } from "vitest";
import {
  DEFAULT_SERIAL_INSTANCE,
  normalizeInstanceUrl,
  originPermission,
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
  });

  it("defaults schemeless local instances to HTTP", () => {
    expect(normalizeInstanceUrl("localhost:3005")).toBe(
      "http://localhost:3005",
    );
    expect(normalizeInstanceUrl("127.0.0.1:3005")).toBe(
      "http://127.0.0.1:3005",
    );
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
  });
});
