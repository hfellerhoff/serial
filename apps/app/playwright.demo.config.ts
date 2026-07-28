import { defineConfig } from "@playwright/test";
import { baseConfig } from "./playwright.config";
import {
  DEMO_APP_PORT,
  DEMO_RSS_SERVER_PORT,
} from "./tests/e2e/fixtures/ports";

export default defineConfig({
  ...baseConfig,
  testDir: "./tests/e2e/demo",
  use: {
    ...baseConfig.use,
    baseURL: `http://localhost:${DEMO_APP_PORT}`,
  },
  webServer: [
    {
      command: "pnpm dev:test:demo",
      url: `http://127.0.0.1:${DEMO_APP_PORT}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `node --import=tsx tests/e2e/fixtures/rss-server.ts ${DEMO_RSS_SERVER_PORT}`,
      url: `http://127.0.0.1:${DEMO_RSS_SERVER_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
