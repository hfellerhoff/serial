import { enablePublicSignups } from "./e2e/fixtures/enable-public-signups";
import {
  SELF_HOSTED_APP_PORT,
  SELF_HOSTED_BOOTSTRAP_APP_PORT,
  SELF_HOSTED_BOOTSTRAP_TURSO_PORT,
  SELF_HOSTED_TURSO_PORT,
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
  await Promise.all([
    waitForApp(`http://localhost:${SELF_HOSTED_APP_PORT}/api/health`),
    waitForApp(`http://localhost:${SELF_HOSTED_BOOTSTRAP_APP_PORT}/api/health`),
  ]);
  await Promise.all([
    resetDb(SELF_HOSTED_TURSO_PORT),
    resetDb(SELF_HOSTED_BOOTSTRAP_TURSO_PORT),
  ]);
  await enablePublicSignups(SELF_HOSTED_TURSO_PORT);
  await seedAdmin({
    tursoPort: SELF_HOSTED_TURSO_PORT,
    name: "E2E Harness Admin",
    email: "e2e-harness-admin@example.com",
    password: "testpassword123",
  });
  // Every configured provider enabled, so the auth pages render the full
  // provider section (email, Atmosphere, generic OAuth) for ordering specs.
  // Must run after seedAdmin, which resets both provider lists to email-only.
  await setEnabledAuthProviders(SELF_HOSTED_TURSO_PORT, [
    "email",
    "oauth",
    "atproto",
  ]);
}
