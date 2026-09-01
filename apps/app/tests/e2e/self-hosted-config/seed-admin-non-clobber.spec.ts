import { expect, test } from "@playwright/test";
import { createClient } from "@libsql/client";
import { seedAdmin } from "../fixtures/auth";
import { SELF_HOSTED_CONFIG_TURSO_PORT } from "../fixtures/ports";
import { cleanupUser, generateTestEmail } from "../fixtures/seed-db";
import { setEnabledAuthProviders } from "../fixtures/set-enabled-auth-providers";

/**
 * Regression guard for seedAdmin's non-clobbering invariant: the fixture
 * ensures the enabled-provider rows exist but must never overwrite a set
 * someone else configured — specs call it mid-suite, and global setup owns
 * the actual enabled set. A past version clobbered both rows to ["email"],
 * silently disabling every other provider for the rest of the run.
 */

async function readProviderRows() {
  const client = createClient({
    url: `http://127.0.0.1:${SELF_HOSTED_CONFIG_TURSO_PORT}`,
  });
  try {
    const result = await client.execute(
      `SELECT key, value FROM serial_app_config
       WHERE key IN ('enabled-signin-providers', 'enabled-signup-providers')
       ORDER BY key`,
    );
    return Object.fromEntries(
      result.rows.map((row) => [row.key as string, row.value as string]),
    );
  } finally {
    client.close();
  }
}

test.describe("seedAdmin provider-config non-clobbering", () => {
  let adminEmail: string;

  test.afterEach(async () => {
    // Restore the global-setup provider state for the other config specs.
    await setEnabledAuthProviders(SELF_HOSTED_CONFIG_TURSO_PORT, [
      "email",
      "oauth",
      "atproto",
    ]);
    if (adminEmail) {
      await cleanupUser(SELF_HOSTED_CONFIG_TURSO_PORT, adminEmail);
    }
  });

  test("a mid-suite seedAdmin leaves a configured provider set untouched", async () => {
    const configured = JSON.stringify(["email", "atproto"]);
    await setEnabledAuthProviders(SELF_HOSTED_CONFIG_TURSO_PORT, [
      "email",
      "atproto",
    ]);

    adminEmail = generateTestEmail();
    await seedAdmin({
      tursoPort: SELF_HOSTED_CONFIG_TURSO_PORT,
      name: "Non-Clobber Admin",
      email: adminEmail,
      password: "testpassword123",
    });

    expect(await readProviderRows()).toEqual({
      "enabled-signin-providers": configured,
      "enabled-signup-providers": configured,
    });
  });
});
