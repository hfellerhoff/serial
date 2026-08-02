import { defineConfig } from "@playwright/test";
import { baseConfig } from "./playwright.config";
import {
  SELF_HOSTED_BOOTSTRAP_APP_PORT,
  SELF_HOSTED_BOOTSTRAP_TURSO_PORT,
} from "./tests/e2e/fixtures/ports";

const productionTestServer =
  `./node_modules/.bin/concurrently --kill-others ` +
  `"turso dev --db-file serial-test-self-hosted-bootstrap.db --port ${SELF_HOSTED_BOOTSTRAP_TURSO_PORT}" ` +
  `"./node_modules/.bin/dotenv -e .env.test.self-hosted -- node --import tsx src/server/db/migrate.ts && ` +
  `./node_modules/.bin/dotenv -e .env.test.self-hosted -- ./node_modules/.bin/vite preview --port ${SELF_HOSTED_BOOTSTRAP_APP_PORT} --strictPort"`;

export default defineConfig({
  ...baseConfig,
  fullyParallel: false,
  workers: 1,
  globalSetup: "./tests/global-setup.self-hosted-bootstrap.ts",
  testDir: "./tests/e2e/self-hosted-bootstrap",
  use: {
    ...baseConfig.use,
    baseURL: `http://localhost:${SELF_HOSTED_BOOTSTRAP_APP_PORT}`,
  },
  webServer: {
    command: productionTestServer,
    url: `http://localhost:${SELF_HOSTED_BOOTSTRAP_APP_PORT}/api/health`,
    stdout: "pipe",
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
