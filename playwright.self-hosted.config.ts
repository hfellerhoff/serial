import { defineConfig } from "@playwright/test";
import { baseConfig } from "./playwright.base.config";

export default defineConfig({
  ...baseConfig,
  globalSetup: "./tests/global-setup.self-hosted.ts",
  testDir: "./tests/e2e/self-hosted",
  use: {
    ...baseConfig.use,
    baseURL: "http://localhost:3001",
  },
  webServer: [
    {
      command: "pnpm dev:test:self-hosted",
      url: "http://localhost:3001",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "node --import=tsx tests/e2e/fixtures/rss-server.ts",
      url: "http://127.0.0.1:3003",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
