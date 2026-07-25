import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getBrowserPublicConfig,
  SERIAL_PUBLIC_CONFIG_KEY,
  serializePublicConfig,
} from "~/lib/public-config";

const REQUIRED_PUBLIC_CONFIG = {
  PUBLIC_BASE_URL: "https://serial.example.com",
  PUBLIC_SUPPORT_EMAIL_ADDRESS: undefined,
  PUBLIC_SENTRY_DSN_WEB: undefined,
  PUBLIC_UMAMI_WEBSITE_ID: undefined,
  PUBLIC_UMAMI_SRC: undefined,
  PUBLIC_IS_MAINTENANCE_MODE: false,
  PUBLIC_IS_MAIN_INSTANCE: false,
  PUBLIC_IS_DEMO_INSTANCE: false,
};

describe("public config", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("normalizes empty optional values and defaults instance flags", async () => {
    vi.stubEnv("SKIP_ENV_VALIDATION", "");
    vi.stubEnv("PUBLIC_BASE_URL", REQUIRED_PUBLIC_CONFIG.PUBLIC_BASE_URL);
    vi.stubEnv("PUBLIC_SUPPORT_EMAIL_ADDRESS", "");

    const { env } = await import("~/env");

    expect({
      PUBLIC_BASE_URL: env.PUBLIC_BASE_URL,
      PUBLIC_SUPPORT_EMAIL_ADDRESS: env.PUBLIC_SUPPORT_EMAIL_ADDRESS,
      PUBLIC_IS_MAINTENANCE_MODE: env.PUBLIC_IS_MAINTENANCE_MODE,
      PUBLIC_IS_MAIN_INSTANCE: env.PUBLIC_IS_MAIN_INSTANCE,
    }).toEqual({
      PUBLIC_BASE_URL: REQUIRED_PUBLIC_CONFIG.PUBLIC_BASE_URL,
      PUBLIC_SUPPORT_EMAIL_ADDRESS: undefined,
      PUBLIC_IS_MAINTENANCE_MODE: false,
      PUBLIC_IS_MAIN_INSTANCE: false,
    });
  });

  it("maps legacy aliases before createEnv validation", async () => {
    vi.stubEnv("SKIP_ENV_VALIDATION", "");
    vi.stubEnv("PUBLIC_BASE_URL", "");
    vi.stubEnv("VITE_PUBLIC_BASE_URL", "https://legacy.example.com");
    vi.stubEnv("VITE_PUBLIC_SUPPORT_EMAIL_ADDRESS", "legacy@example.com");
    vi.stubEnv("VITE_PUBLIC_IS_MAINTENANCE_MODE", "true");

    const { env } = await import("~/env");

    expect(env.PUBLIC_BASE_URL).toBe("https://legacy.example.com");
    expect(env.PUBLIC_SUPPORT_EMAIL_ADDRESS).toBe("legacy@example.com");
    expect(env.PUBLIC_IS_MAINTENANCE_MODE).toBe(true);
  });

  it("prefers canonical values and coerces boolean strings", async () => {
    vi.stubEnv("SKIP_ENV_VALIDATION", "");
    vi.stubEnv("PUBLIC_BASE_URL", "https://canonical.example.com");
    vi.stubEnv("VITE_PUBLIC_BASE_URL", "https://legacy.example.com");
    vi.stubEnv("PUBLIC_IS_MAIN_INSTANCE", "false");
    vi.stubEnv("VITE_PUBLIC_IS_MAIN_INSTANCE", "true");

    const { env } = await import("~/env");

    expect(env.PUBLIC_BASE_URL).toBe("https://canonical.example.com");
    expect(env.PUBLIC_IS_MAIN_INSTANCE).toBe(false);
  });

  it("does not enable demo mode from public environment variables", async () => {
    vi.stubEnv("SKIP_ENV_VALIDATION", "");
    vi.stubEnv("PUBLIC_BASE_URL", REQUIRED_PUBLIC_CONFIG.PUBLIC_BASE_URL);
    vi.stubEnv("PUBLIC_IS_DEMO_INSTANCE", "true");
    vi.stubEnv("VITE_PUBLIC_IS_DEMO_INSTANCE", "true");
    vi.stubGlobal("__SERIAL_DEMO_BUILD__", false);

    const { getServerPublicConfig } =
      await import("~/server/public-config.server");

    expect(getServerPublicConfig().PUBLIC_IS_DEMO_INSTANCE).toBe(false);
  });

  it("selects only validated public values for transport", async () => {
    vi.stubEnv("SKIP_ENV_VALIDATION", "");
    vi.stubEnv("PUBLIC_BASE_URL", REQUIRED_PUBLIC_CONFIG.PUBLIC_BASE_URL);
    vi.stubEnv("PUBLIC_IS_MAINTENANCE_MODE", "true");
    vi.stubEnv("PUBLIC_IS_MAIN_INSTANCE", "false");
    vi.stubGlobal("__SERIAL_DEMO_BUILD__", true);

    const { getServerPublicConfig } =
      await import("~/server/public-config.server");
    const publicConfig = getServerPublicConfig();

    expect(publicConfig).toEqual({
      ...REQUIRED_PUBLIC_CONFIG,
      PUBLIC_SUPPORT_EMAIL_ADDRESS: undefined,
      PUBLIC_SENTRY_DSN_WEB: undefined,
      PUBLIC_UMAMI_WEBSITE_ID: undefined,
      PUBLIC_UMAMI_SRC: undefined,
      PUBLIC_IS_MAINTENANCE_MODE: true,
      PUBLIC_IS_MAIN_INSTANCE: false,
      PUBLIC_IS_DEMO_INSTANCE: true,
    });
    expect(publicConfig).not.toHaveProperty("BETTER_AUTH_SECRET");
  });

  it("round trips the config initialized in the browser document", () => {
    const publicConfig = {
      ...REQUIRED_PUBLIC_CONFIG,
      PUBLIC_SUPPORT_EMAIL_ADDRESS: "support@example.com",
      PUBLIC_IS_DEMO_INSTANCE: true,
    };
    vi.stubGlobal("window", {
      [SERIAL_PUBLIC_CONFIG_KEY]: serializePublicConfig(publicConfig),
    });

    const browserPublicConfig = getBrowserPublicConfig();

    expect(browserPublicConfig).toEqual(publicConfig);
    expect(getBrowserPublicConfig()).toBe(browserPublicConfig);
  });
});
