import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getBrowserPublicConfig,
  publicConfigSchema,
  resolvePublicConfig,
  serializePublicConfig,
} from "~/lib/public-config";

const REQUIRED_PUBLIC_CONFIG = {
  PUBLIC_BASE_URL: "https://serial.example.com",
};

describe("public config", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("normalizes empty optional values and defaults instance flags", () => {
    const publicConfig = publicConfigSchema.parse({
      ...REQUIRED_PUBLIC_CONFIG,
      PUBLIC_SUPPORT_EMAIL_ADDRESS: "",
      PUBLIC_IS_DEMO_INSTANCE: "",
    });

    expect(publicConfig).toEqual({
      ...REQUIRED_PUBLIC_CONFIG,
      PUBLIC_SUPPORT_EMAIL_ADDRESS: undefined,
      PUBLIC_IS_MAINTENANCE_MODE: false,
      PUBLIC_IS_MAIN_INSTANCE: false,
      PUBLIC_IS_DEMO_INSTANCE: false,
    });
  });

  it("resolves legacy VITE_PUBLIC aliases to canonical keys", () => {
    const publicConfig = resolvePublicConfig({
      VITE_PUBLIC_BASE_URL: "https://legacy.example.com",
      VITE_PUBLIC_SUPPORT_EMAIL_ADDRESS: "legacy@example.com",
      VITE_PUBLIC_IS_MAINTENANCE_MODE: "true",
    });

    expect(publicConfig.PUBLIC_BASE_URL).toBe("https://legacy.example.com");
    expect(publicConfig.PUBLIC_SUPPORT_EMAIL_ADDRESS).toBe(
      "legacy@example.com",
    );
    expect(publicConfig.PUBLIC_IS_MAINTENANCE_MODE).toBe(true);
  });

  it("prefers canonical values and coerces boolean strings", () => {
    const publicConfig = resolvePublicConfig({
      PUBLIC_BASE_URL: "https://canonical.example.com",
      VITE_PUBLIC_BASE_URL: "https://legacy.example.com",
      PUBLIC_IS_DEMO_INSTANCE: "false",
      VITE_PUBLIC_IS_DEMO_INSTANCE: "true",
    });

    expect(publicConfig.PUBLIC_BASE_URL).toBe("https://canonical.example.com");
    expect(publicConfig.PUBLIC_IS_DEMO_INSTANCE).toBe(false);
  });

  it("reads the config initialized in the browser document", () => {
    const publicConfig = publicConfigSchema.parse(REQUIRED_PUBLIC_CONFIG);
    vi.stubGlobal("window", { __SERIAL_PUBLIC_CONFIG__: publicConfig });

    expect(getBrowserPublicConfig()).toEqual(publicConfig);
  });

  it("initializes the typed client environment from runtime config", async () => {
    const publicConfig = publicConfigSchema.parse({
      ...REQUIRED_PUBLIC_CONFIG,
      PUBLIC_SUPPORT_EMAIL_ADDRESS: "support@example.com",
    });
    vi.stubGlobal("window", { __SERIAL_PUBLIC_CONFIG__: publicConfig });

    const { env } = await import("~/env");

    expect(env.PUBLIC_BASE_URL).toBe(REQUIRED_PUBLIC_CONFIG.PUBLIC_BASE_URL);
    expect(env.PUBLIC_SUPPORT_EMAIL_ADDRESS).toBe("support@example.com");
    expect(env.PUBLIC_IS_DEMO_INSTANCE).toBe(false);
  });

  it("escapes values that could terminate an inline script", () => {
    const publicConfig = publicConfigSchema.parse({
      ...REQUIRED_PUBLIC_CONFIG,
      PUBLIC_UMAMI_WEBSITE_ID: "</script><script>alert(1)</script>",
    });

    const serializedPublicConfig = serializePublicConfig(publicConfig);

    expect(serializedPublicConfig).not.toContain("<");
    expect(serializedPublicConfig).toContain("\\u003c/script\\u003e");
  });
});
