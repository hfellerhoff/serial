import { devices } from "@playwright/test";
import type { PlaywrightTestConfig } from "@playwright/test";

export const baseConfig = {
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    trace: "on-first-retry",
  },
  projects: [
    {
      use: { ...devices["Desktop Chrome"] },
      testMatch: /.*\.spec\.ts/,
    },
  ],
} satisfies PlaywrightTestConfig;
