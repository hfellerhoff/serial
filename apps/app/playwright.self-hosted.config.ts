import { defineConfig, devices } from "@playwright/test";
import { baseConfig } from "./playwright.config";
import {
  SELF_HOSTED_APP_PORT,
  SELF_HOSTED_BOOTSTRAP_APP_PORT,
  SELF_HOSTED_BOOTSTRAP_TURSO_PORT,
  SELF_HOSTED_RSS_SERVER_PORT,
  SELF_HOSTED_TURSO_PORT,
} from "./tests/e2e/fixtures/ports";

const productionTestServer =
  `./node_modules/.bin/concurrently --kill-others ` +
  `"turso dev --db-file serial-test-self-hosted.db --port ${SELF_HOSTED_TURSO_PORT}" ` +
  `"./node_modules/.bin/dotenv -e .env.test.self-hosted -- node --import tsx src/server/db/migrate.ts && ` +
  `./node_modules/.bin/dotenv -e .env.test.self-hosted -- ./node_modules/.bin/vite preview --port ${SELF_HOSTED_APP_PORT} --strictPort"`;

const bootstrapProductionTestServer =
  `./node_modules/.bin/concurrently --kill-others ` +
  `"turso dev --db-file serial-test-self-hosted-bootstrap.db --port ${SELF_HOSTED_BOOTSTRAP_TURSO_PORT}" ` +
  `"./node_modules/.bin/dotenv -e .env.test.self-hosted -- node --import tsx src/server/db/migrate.ts && ` +
  `./node_modules/.bin/dotenv -e .env.test.self-hosted -- ./node_modules/.bin/vite preview --port ${SELF_HOSTED_BOOTSTRAP_APP_PORT} --strictPort"`;

const bootstrapDevelopmentTestServer =
  `./node_modules/.bin/concurrently --kill-others ` +
  `"turso dev --db-file serial-test-self-hosted-bootstrap.db --port ${SELF_HOSTED_BOOTSTRAP_TURSO_PORT}" ` +
  `"./node_modules/.bin/dotenv -e .env.test.self-hosted -- node --import tsx src/server/db/migrate.ts && ` +
  `./node_modules/.bin/dotenv -e .env.test.self-hosted -- ./node_modules/.bin/vite dev --port ${SELF_HOSTED_BOOTSTRAP_APP_PORT} --strictPort"`;

const bootstrapBaseUrl = `http://localhost:${SELF_HOSTED_BOOTSTRAP_APP_PORT}`;
const bootstrapEnvironment = {
  DATABASE_URL: `http://127.0.0.1:${SELF_HOSTED_BOOTSTRAP_TURSO_PORT}`,
  PORT: String(SELF_HOSTED_BOOTSTRAP_APP_PORT),
  PUBLIC_BASE_URL: bootstrapBaseUrl,
  VITE_PUBLIC_BASE_URL: bootstrapBaseUrl,
};

export default defineConfig({
  ...baseConfig,
  workers: process.env.CI ? 2 : undefined,
  globalSetup: "./tests/global-setup.self-hosted.ts",
  testDir: "./tests/e2e",
  projects: [
    {
      name: "self-hosted",
      testDir: "./tests/e2e/self-hosted",
      workers: process.env.CI ? 1 : undefined,
      use: {
        ...baseConfig.use,
        ...devices["Desktop Chrome"],
        baseURL: `http://localhost:${SELF_HOSTED_APP_PORT}`,
      },
    },
    {
      name: "self-hosted-bootstrap",
      fullyParallel: false,
      testDir: "./tests/e2e/self-hosted-bootstrap",
      workers: 1,
      use: {
        ...baseConfig.use,
        ...devices["Desktop Chrome"],
        baseURL: bootstrapBaseUrl,
      },
    },
  ],
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
      command:
        process.env.SERIAL_CLIENT_PERFORMANCE_PRODUCTION === "1"
          ? bootstrapProductionTestServer
          : bootstrapDevelopmentTestServer,
      env: bootstrapEnvironment,
      url: `${bootstrapBaseUrl}/api/health`,
      stdout: "pipe",
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: `node --import=tsx tests/e2e/fixtures/rss-server.ts ${SELF_HOSTED_RSS_SERVER_PORT}`,
      url: `http://127.0.0.1:${SELF_HOSTED_RSS_SERVER_PORT}`,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
