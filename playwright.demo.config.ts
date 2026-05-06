import { defineConfig } from "@playwright/test";
import { baseConfig } from "./playwright.config";

export default defineConfig({
  ...baseConfig,
  testDir: "./tests/e2e/demo",
  use: {
    ...baseConfig.use,
    baseURL: "http://localhost:3005",
  },
  webServer: [
    {
      command: "pnpm dev:test:demo",
      url: "http://127.0.0.1:3005/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "node --import=tsx tests/e2e/fixtures/rss-server.ts 3006",
      url: "http://127.0.0.1:3006",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
