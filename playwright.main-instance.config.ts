import { defineConfig } from "@playwright/test";
import { baseConfig } from "./playwright.config";

export default defineConfig({
  ...baseConfig,
  globalSetup: "./tests/global-setup.ts",
  testDir: "./tests/e2e/main-instance",
  use: {
    ...baseConfig.use,
    baseURL: "http://localhost:3000",
  },
  webServer: {
    command: "pnpm dev:test:main",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
});
