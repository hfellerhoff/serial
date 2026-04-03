import { defineConfig } from "@playwright/test";
import { baseConfig } from "./playwright.config";

export default defineConfig({
  ...baseConfig,
  globalSetup: "./tests/global-setup.ts",
  testDir: "./tests/e2e/main-instance",
  use: {
    ...baseConfig.use,
    baseURL: "http://localhost:3002",
  },
  webServer: [
    {
      command: "pnpm dev:test:main",
      url: "http://localhost:3002",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "node --import=tsx tests/e2e/fixtures/rss-server.ts 3004",
      url: "http://127.0.0.1:3004",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
