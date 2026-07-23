import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getBrowserPublicConfig,
  publicConfigSchema,
  serializePublicConfig,
} from "~/lib/public-config";

const REQUIRED_PUBLIC_CONFIG = {
  VITE_PUBLIC_BASE_URL: "https://serial.example.com",
};

describe("public config", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("normalizes empty optional values and defaults instance flags", () => {
    const publicConfig = publicConfigSchema.parse({
      ...REQUIRED_PUBLIC_CONFIG,
      VITE_PUBLIC_SUPPORT_EMAIL_ADDRESS: "",
      VITE_PUBLIC_IS_DEMO_INSTANCE: "",
    });

    expect(publicConfig).toEqual({
      ...REQUIRED_PUBLIC_CONFIG,
      VITE_PUBLIC_SUPPORT_EMAIL_ADDRESS: undefined,
      VITE_PUBLIC_IS_MAINTENANCE_MODE: "false",
      VITE_PUBLIC_IS_MAIN_INSTANCE: "false",
      VITE_PUBLIC_IS_DEMO_INSTANCE: "false",
    });
  });

  it("reads the config initialized in the browser document", () => {
    const publicConfig = publicConfigSchema.parse(REQUIRED_PUBLIC_CONFIG);
    vi.stubGlobal("window", { __SERIAL_PUBLIC_CONFIG__: publicConfig });

    expect(getBrowserPublicConfig()).toEqual(publicConfig);
  });

  it("initializes the typed client environment from runtime config", async () => {
    const publicConfig = publicConfigSchema.parse({
      ...REQUIRED_PUBLIC_CONFIG,
      VITE_PUBLIC_SUPPORT_EMAIL_ADDRESS: "support@example.com",
    });
    vi.stubGlobal("window", { __SERIAL_PUBLIC_CONFIG__: publicConfig });

    const { env } = await import("~/env");

    expect(env.VITE_PUBLIC_BASE_URL).toBe(
      REQUIRED_PUBLIC_CONFIG.VITE_PUBLIC_BASE_URL,
    );
    expect(env.VITE_PUBLIC_SUPPORT_EMAIL_ADDRESS).toBe("support@example.com");
  });

  it("escapes values that could terminate an inline script", () => {
    const publicConfig = publicConfigSchema.parse({
      ...REQUIRED_PUBLIC_CONFIG,
      VITE_PUBLIC_UMAMI_WEBSITE_ID: "</script><script>alert(1)</script>",
    });

    const serializedPublicConfig = serializePublicConfig(publicConfig);

    expect(serializedPublicConfig).not.toContain("<");
    expect(serializedPublicConfig).toContain("\\u003c/script\\u003e");
  });
});
