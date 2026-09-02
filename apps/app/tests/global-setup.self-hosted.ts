import { enablePublicSignups } from "./e2e/fixtures/enable-public-signups";
import {
  SELF_HOSTED_APP_PORT,
  SELF_HOSTED_BOOTSTRAP_APP_PORT,
  SELF_HOSTED_BOOTSTRAP_TURSO_PORT,
  SELF_HOSTED_CONFIG_APP_PORT,
  SELF_HOSTED_CONFIG_TURSO_PORT,
  SELF_HOSTED_TURSO_PORT,
  SELF_HOSTED_UNCONFIGURED_APP_PORT,
  SELF_HOSTED_UNCONFIGURED_TURSO_PORT,
} from "./e2e/fixtures/ports";
import { seedAdmin } from "./e2e/fixtures/auth";
import { resetDb } from "./e2e/fixtures/reset-db";
import { setEnabledAuthProviders } from "./e2e/fixtures/set-enabled-auth-providers";

async function waitForApp(url: string, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

export default async function globalSetup() {
  await Promise.all(
    [
      SELF_HOSTED_APP_PORT,
      SELF_HOSTED_BOOTSTRAP_APP_PORT,
      SELF_HOSTED_CONFIG_APP_PORT,
      SELF_HOSTED_UNCONFIGURED_APP_PORT,
    ].map((port) => waitForApp(`http://localhost:${port}/api/health`)),
  );
  await Promise.all(
    [
      SELF_HOSTED_TURSO_PORT,
      SELF_HOSTED_BOOTSTRAP_TURSO_PORT,
      SELF_HOSTED_CONFIG_TURSO_PORT,
      SELF_HOSTED_UNCONFIGURED_TURSO_PORT,
    ].map((port) => resetDb(port)),
  );
  // The bootstrap instance stays unseeded: its specs own first-admin
  // creation. The other three get an admin and public sign-ups.
  await Promise.all(
    [
      SELF_HOSTED_TURSO_PORT,
      SELF_HOSTED_CONFIG_TURSO_PORT,
      SELF_HOSTED_UNCONFIGURED_TURSO_PORT,
    ].map(async (port) => {
      await enablePublicSignups(port);
      await seedAdmin({
        tursoPort: port,
        name: "E2E Harness Admin",
        email: "e2e-harness-admin@example.com",
        password: "testpassword123",
      });
      // Every provider enabled, so the auth pages render the full provider
      // section (email, Atmosphere, generic OAuth) for ordering specs.
      // seedAdmin seeds email-only rows when they're absent; this runs
      // after it so the full set overwrites them. On the unconfigured
      // instance the same full set proves the env-level soft-disable wins
      // over DB enablement; on the config instance it is just the baseline
      // that specs overwrite per test.
      await setEnabledAuthProviders(port, ["email", "oauth", "atproto"]);
    }),
  );
}
