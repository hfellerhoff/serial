import { defineConfig } from "@playwright/test";
import { baseConfig } from "./playwright.config";
import {
  SELF_HOSTED_APP_PORT,
  SELF_HOSTED_RSS_SERVER_PORT,
  SELF_HOSTED_TURSO_PORT,
} from "./tests/e2e/fixtures/ports";

const productionTestServer =
  `./node_modules/.bin/concurrently --kill-others ` +
  `"turso dev --db-file serial-test-self-hosted.db --port ${SELF_HOSTED_TURSO_PORT}" ` +
  `"./node_modules/.bin/dotenv -e .env.test.self-hosted -- node --import tsx src/server/db/migrate.ts && ` +
  `./node_modules/.bin/dotenv -e .env.test.self-hosted -- ./node_modules/.bin/vite preview --port ${SELF_HOSTED_APP_PORT} --strictPort"`;

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
      command:
        process.env.SERIAL_CLIENT_PERFORMANCE_PRODUCTION === "1"
          ? productionTestServer
          : "pnpm dev:test:self-hosted",
      url: `http://localhost:${SELF_HOSTED_APP_PORT}`,
      stdout: "pipe",
      timeout: 120_000,
      reuseExistingServer:
        process.env.SERIAL_CLIENT_PERFORMANCE_PRODUCTION !== "1" &&
        !process.env.CI,
    },
    {
      command: `node --import=tsx tests/e2e/fixtures/rss-server.ts ${SELF_HOSTED_RSS_SERVER_PORT}`,
      url: `http://127.0.0.1:${SELF_HOSTED_RSS_SERVER_PORT}`,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
