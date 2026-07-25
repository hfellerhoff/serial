import { defineConfig } from "@playwright/test";
import { baseConfig } from "./playwright.config";
import {
  SELF_HOSTED_APP_PORT,
  SELF_HOSTED_RSS_SERVER_PORT,
} from "./tests/e2e/fixtures/ports";

export default defineConfig({
  ...baseConfig,
  globalSetup: "./tests/global-setup.self-hosted.ts",
  testDir: "./tests/e2e/self-hosted",
  use: {
    ...baseConfig.use,
    baseURL: `http://localhost:${SELF_HOSTED_APP_PORT}`,
  },
  webServer: [
    {
      command: "pnpm dev:test:self-hosted",
      url: `http://localhost:${SELF_HOSTED_APP_PORT}`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `node --import=tsx tests/e2e/fixtures/rss-server.ts ${SELF_HOSTED_RSS_SERVER_PORT}`,
      url: `http://127.0.0.1:${SELF_HOSTED_RSS_SERVER_PORT}`,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
