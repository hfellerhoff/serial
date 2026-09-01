function getPort(environmentVariable: string, fallback: number) {
  const value = Number(process.env[environmentVariable]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/** Ports for the "main" test environment */
export const MAIN_TURSO_PORT = getPort("SERIAL_TEST_MAIN_TURSO_PORT", 8081);
export const MAIN_APP_PORT = getPort("SERIAL_TEST_MAIN_APP_PORT", 3002);

/** Ports for the "self-hosted" test environment */
export const SELF_HOSTED_TURSO_PORT = getPort(
  "SERIAL_TEST_SELF_HOSTED_TURSO_PORT",
  8082,
);
export const SELF_HOSTED_APP_PORT = getPort(
  "SERIAL_TEST_SELF_HOSTED_APP_PORT",
  3001,
);

/** Ports for the isolated first-admin self-hosted test environment */
export const SELF_HOSTED_BOOTSTRAP_TURSO_PORT = getPort(
  "SERIAL_TEST_SELF_HOSTED_BOOTSTRAP_TURSO_PORT",
  8084,
);
export const SELF_HOSTED_BOOTSTRAP_APP_PORT = getPort(
  "SERIAL_TEST_SELF_HOSTED_BOOTSTRAP_APP_PORT",
  3007,
);

/** Ports for the isolated serial provider-config self-hosted test environment */
export const SELF_HOSTED_CONFIG_TURSO_PORT = getPort(
  "SERIAL_TEST_SELF_HOSTED_CONFIG_TURSO_PORT",
  8085,
);
export const SELF_HOSTED_CONFIG_APP_PORT = getPort(
  "SERIAL_TEST_SELF_HOSTED_CONFIG_APP_PORT",
  3010,
);

/** Ports for the atproto-unconfigured self-hosted test environment */
export const SELF_HOSTED_UNCONFIGURED_TURSO_PORT = getPort(
  "SERIAL_TEST_SELF_HOSTED_UNCONFIGURED_TURSO_PORT",
  8086,
);
export const SELF_HOSTED_UNCONFIGURED_APP_PORT = getPort(
  "SERIAL_TEST_SELF_HOSTED_UNCONFIGURED_APP_PORT",
  3011,
);

/** Stub Resend API capturing emails for the config test environment */
export const SELF_HOSTED_EMAIL_SERVER_PORT = getPort(
  "SERIAL_TEST_SELF_HOSTED_EMAIL_PORT",
  3012,
);

/** Ports for the "demo" test environment */
export const DEMO_TURSO_PORT = getPort("SERIAL_TEST_DEMO_TURSO_PORT", 8083);
export const DEMO_APP_PORT = getPort("SERIAL_TEST_DEMO_APP_PORT", 3005);

/** Stub AppView backing the atproto handle typeahead in self-hosted e2e */
export const SELF_HOSTED_APPVIEW_SERVER_PORT = getPort(
  "SERIAL_TEST_SELF_HOSTED_APPVIEW_PORT",
  3009,
);

/** RSS fixture servers (one per test environment for full isolation) */
export const SELF_HOSTED_RSS_SERVER_PORT = getPort(
  "SERIAL_TEST_SELF_HOSTED_RSS_PORT",
  3003,
);
export const MAIN_RSS_SERVER_PORT = getPort("SERIAL_TEST_MAIN_RSS_PORT", 3004);
export const DEMO_RSS_SERVER_PORT = getPort("SERIAL_TEST_DEMO_RSS_PORT", 3006);
