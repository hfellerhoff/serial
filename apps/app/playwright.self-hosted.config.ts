import { defineConfig, devices } from "@playwright/test";
import { baseConfig } from "./playwright.config";
import {
  SELF_HOSTED_APP_PORT,
  SELF_HOSTED_APPVIEW_SERVER_PORT,
  SELF_HOSTED_BOOTSTRAP_APP_PORT,
  SELF_HOSTED_BOOTSTRAP_TURSO_PORT,
  SELF_HOSTED_CONFIG_APP_PORT,
  SELF_HOSTED_CONFIG_TURSO_PORT,
  SELF_HOSTED_EMAIL_SERVER_PORT,
  SELF_HOSTED_RSS_SERVER_PORT,
  SELF_HOSTED_TURSO_PORT,
  SELF_HOSTED_UNCONFIGURED_APP_PORT,
  SELF_HOSTED_UNCONFIGURED_TURSO_PORT,
} from "./tests/e2e/fixtures/ports";
import { supervisedWebServerCommand } from "./tests/e2e/fixtures/web-server-command";

const productionTestServer =
  `./node_modules/.bin/concurrently --kill-others ` +
  `"turso dev --db-file serial-test-self-hosted.db --port ${SELF_HOSTED_TURSO_PORT}" ` +
  `"./node_modules/.bin/dotenv -e .env.test.self-hosted -- node --import tsx src/server/db/migrate.ts && ` +
  `./node_modules/.bin/dotenv -e .env.test.self-hosted -- env CI=1 ./node_modules/.bin/vite preview --port ${SELF_HOSTED_APP_PORT} --strictPort"`;

/**
 * An isolated app server + database cloned from the proven bootstrap
 * template: own DB file, own ports, own webServer entry, serial project.
 * `extraEnvironment` lets an instance diverge from the shared flavor
 * (blanked ATPROTO_* keys, the stub email provider); dotenv leaves
 * already-set variables alone, so these overrides win over the env file.
 */
function isolatedInstanceServer({
  dbFile,
  tursoPort,
  appPort,
  extraEnvironment = {},
}: {
  dbFile: string;
  tursoPort: number;
  appPort: number;
  extraEnvironment?: Record<string, string>;
}) {
  const baseUrl = `http://localhost:${appPort}`;
  const productionServer =
    `./node_modules/.bin/concurrently --kill-others ` +
    `"turso dev --db-file ${dbFile} --port ${tursoPort}" ` +
    `"./node_modules/.bin/dotenv -e .env.test.self-hosted -- node --import tsx src/server/db/migrate.ts && ` +
    `./node_modules/.bin/dotenv -e .env.test.self-hosted -- env CI=1 ./node_modules/.bin/vite preview --port ${appPort} --strictPort"`;
  const developmentServer =
    `./node_modules/.bin/concurrently --kill-others ` +
    `"turso dev --db-file ${dbFile} --port ${tursoPort}" ` +
    `"./node_modules/.bin/dotenv -e .env.test.self-hosted -- node --import tsx src/server/db/migrate.ts && ` +
    `./node_modules/.bin/dotenv -e .env.test.self-hosted -- ./node_modules/.bin/vite dev --port ${appPort} --strictPort"`;

  return {
    command: supervisedWebServerCommand(
      process.env.SERIAL_CLIENT_PERFORMANCE_PRODUCTION === "1"
        ? productionServer
        : developmentServer,
    ),
    env: {
      DATABASE_URL: `http://127.0.0.1:${tursoPort}`,
      PORT: String(appPort),
      PUBLIC_BASE_URL: baseUrl,
      VITE_PUBLIC_BASE_URL: baseUrl,
      ...extraEnvironment,
    },
    url: `${baseUrl}/api/health`,
    stdout: "pipe" as const,
    timeout: 120_000,
    reuseExistingServer: false,
  };
}

function isolatedProject(name: string, appPort: number) {
  return {
    name,
    fullyParallel: false,
    testDir: `./tests/e2e/${name}`,
    workers: 1,
    use: {
      ...baseConfig.use,
      ...devices["Desktop Chrome"],
      baseURL: `http://localhost:${appPort}`,
    },
  };
}

export default defineConfig({
  ...baseConfig,
  workers: process.env.CI ? 2 : undefined,
  globalSetup:
    process.env.SERIAL_E2E_CLEANUP_PROBE === "1"
      ? "./tests/global-setup.e2e-cleanup.ts"
      : "./tests/global-setup.self-hosted.ts",
  testDir: "./tests/e2e",
  projects: [
    {
      name: "self-hosted",
      testDir: "./tests/e2e/self-hosted",
      workers: process.env.CI ? 2 : undefined,
      use: {
        ...baseConfig.use,
        ...devices["Desktop Chrome"],
        baseURL: `http://localhost:${SELF_HOSTED_APP_PORT}`,
      },
    },
    isolatedProject("self-hosted-bootstrap", SELF_HOSTED_BOOTSTRAP_APP_PORT),
    // Serial instance for every spec that sets and asserts a specific
    // enabled-provider set: nothing else mutates its database, so a
    // beforeEach-configured state holds for the whole test.
    isolatedProject("self-hosted-config", SELF_HOSTED_CONFIG_APP_PORT),
    // App server started without the ATPROTO_* keys: configured-ness is
    // env-level, so the soft-disable path needs its own server.
    isolatedProject(
      "self-hosted-unconfigured",
      SELF_HOSTED_UNCONFIGURED_APP_PORT,
    ),
  ],
  webServer: [
    {
      command: supervisedWebServerCommand(
        process.env.SERIAL_CLIENT_PERFORMANCE_PRODUCTION === "1"
          ? productionTestServer
          : "pnpm dev:test:self-hosted",
      ),
      // run-e2e.ts points ATPROTO_APPVIEW_URL at the stub AppView for all
      // app servers; dotenv leaves already-set variables alone.
      url: `http://localhost:${SELF_HOSTED_APP_PORT}`,
      stdout: "pipe",
      timeout: 120_000,
      reuseExistingServer:
        process.env.SERIAL_CLIENT_PERFORMANCE_PRODUCTION !== "1" &&
        !process.env.CI,
    },
    isolatedInstanceServer({
      dbFile: "serial-test-self-hosted-bootstrap.db",
      tursoPort: SELF_HOSTED_BOOTSTRAP_TURSO_PORT,
      appPort: SELF_HOSTED_BOOTSTRAP_APP_PORT,
    }),
    isolatedInstanceServer({
      dbFile: "serial-test-self-hosted-config.db",
      tursoPort: SELF_HOSTED_CONFIG_TURSO_PORT,
      appPort: SELF_HOSTED_CONFIG_APP_PORT,
      // Email enabled through the stub Resend server (the SDK honors
      // RESEND_BASE_URL), so verification flows run hermetically here.
      extraEnvironment: {
        RESEND_API_KEY: "e2e-stub-resend-key",
        RESEND_BASE_URL: `http://127.0.0.1:${SELF_HOSTED_EMAIL_SERVER_PORT}`,
        FROM_EMAIL_ADDRESS: "e2e@serial.test",
      },
    }),
    isolatedInstanceServer({
      dbFile: "serial-test-self-hosted-unconfigured.db",
      tursoPort: SELF_HOSTED_UNCONFIGURED_TURSO_PORT,
      appPort: SELF_HOSTED_UNCONFIGURED_APP_PORT,
      // Blank the run-e2e-injected atproto keys: emptyStringAsUndefined in
      // src/env.js turns these into unset, leaving atproto unconfigured.
      extraEnvironment: {
        ATPROTO_CLIENT_PRIVATE_KEYS: "",
        ATPROTO_STORE_ENCRYPTION_KEY: "",
        ATPROTO_APPVIEW_URL: "",
      },
    }),
    {
      command: supervisedWebServerCommand(
        `node --import=tsx tests/e2e/fixtures/rss-server.ts ${SELF_HOSTED_RSS_SERVER_PORT}`,
      ),
      url: `http://127.0.0.1:${SELF_HOSTED_RSS_SERVER_PORT}`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: supervisedWebServerCommand(
        `node --import=tsx tests/e2e/fixtures/appview-server.ts ${SELF_HOSTED_APPVIEW_SERVER_PORT}`,
      ),
      url: `http://127.0.0.1:${SELF_HOSTED_APPVIEW_SERVER_PORT}`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: supervisedWebServerCommand(
        `node --import=tsx tests/e2e/fixtures/email-server.ts ${SELF_HOSTED_EMAIL_SERVER_PORT}`,
      ),
      url: `http://127.0.0.1:${SELF_HOSTED_EMAIL_SERVER_PORT}`,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
