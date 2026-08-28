import { expect, test } from "@playwright/test";
import { createClient } from "@libsql/client";
import { createId } from "@paralleldrive/cuid2";
import { signUpAsAdmin } from "../fixtures/auth";
import { SELF_HOSTED_TURSO_PORT } from "../fixtures/ports";
import { cleanupUser, generateTestEmail } from "../fixtures/seed-db";
import { setEnabledAuthProviders } from "../fixtures/set-enabled-auth-providers";
import type { Page } from "@playwright/test";

/**
 * Admin sign-in method settings for the Atmosphere provider: the toggle
 * renders alongside email/OAuth, disabling it gates the authorize endpoint
 * server-side, and lockout accounting locks the row while an admin's only
 * sign-in method is an atproto DID.
 */

/** Seed an admin whose only account row is an atproto DID. */
async function seedAtprotoOnlyAdmin(tursoPort: number, email: string) {
  const client = createClient({ url: `http://127.0.0.1:${tursoPort}` });
  const now = Math.floor(Date.now() / 1000);
  const userId = createId();

  await client.batch([
    {
      sql: `INSERT INTO serial_user (id, name, email, email_verified, image, created_at, updated_at, role)
            VALUES (?, 'Atmosphere Admin', ?, 1, NULL, ?, ?, 'admin')`,
      args: [userId, email, now, now],
    },
    {
      sql: `INSERT INTO serial_account (id, account_id, provider_id, user_id, created_at, updated_at)
            VALUES (?, ?, 'atproto', ?, ?, ?)`,
      args: [createId(), `did:plc:e2e${userId}`, userId, now, now],
    },
  ]);

  client.close();
}

async function clearQueryCache(page: Page) {
  await page.evaluate(() => {
    try {
      localStorage.removeItem("REACT_QUERY_OFFLINE_CACHE");
    } catch {
      // localStorage may not be available in some contexts
    }
  });
}

test.describe("admin sign-in method settings", () => {
  let adminEmail: string;
  let atprotoAdminEmail: string;

  test.afterEach(async () => {
    // Restore the global-setup provider state for other specs.
    await setEnabledAuthProviders(SELF_HOSTED_TURSO_PORT, [
      "email",
      "oauth",
      "atproto",
    ]);
    if (atprotoAdminEmail) {
      await cleanupUser(SELF_HOSTED_TURSO_PORT, atprotoAdminEmail);
    }
    if (adminEmail) {
      await cleanupUser(SELF_HOSTED_TURSO_PORT, adminEmail);
    }
  });

  test("atmosphere toggle gates sign-in server-side and locks for an atproto-only admin", async ({
    page,
  }) => {
    test.setTimeout(120000);
    adminEmail = generateTestEmail();

    await signUpAsAdmin({
      page,
      tursoPort: SELF_HOSTED_TURSO_PORT,
      name: "Settings Admin",
      email: adminEmail,
      password: "testpassword123",
    });
    // seedAdmin resets the enabled providers to email only.
    await setEnabledAuthProviders(SELF_HOSTED_TURSO_PORT, [
      "email",
      "oauth",
      "atproto",
    ]);

    await page.goto("/admin/settings");
    await clearQueryCache(page);
    await page.reload();

    // Atmosphere rows render in both method sections.
    const signinToggle = page.locator("#signin-atproto-toggle");
    await expect(signinToggle).toBeVisible({ timeout: 30000 });
    await expect(page.locator("#signup-atproto-toggle")).toBeVisible();
    await expect(signinToggle).toBeChecked();

    // Disable Atmosphere sign-in.
    await signinToggle.click();
    await expect(page.getByText("Sign-in methods updated")).toBeVisible();
    await expect(signinToggle).not.toBeChecked();

    // The authorize endpoint is gated server-side, not just in the UI.
    const disabled = await page.evaluate(async () => {
      const response = await fetch("/api/auth/atproto/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: "example.bsky.social" }),
      });
      return {
        status: response.status,
        body: (await response.json()) as { message?: string },
      };
    });
    expect(disabled.status).toBe(400);
    expect(disabled.body.message).toContain(
      "Atmosphere sign in is currently disabled",
    );

    // Re-enable it.
    await signinToggle.click();
    await expect(signinToggle).toBeChecked();

    // With an admin whose only method is an atproto DID, the row locks:
    // the switch is replaced by the locked indicator.
    atprotoAdminEmail = generateTestEmail();
    await seedAtprotoOnlyAdmin(SELF_HOSTED_TURSO_PORT, atprotoAdminEmail);
    await clearQueryCache(page);
    await page.reload();

    // The row's label keeps its stable htmlFor id even when the switch is
    // replaced by the locked indicator.
    await expect(
      page.locator('label[for="signin-atproto-toggle"]'),
    ).toBeVisible({ timeout: 30000 });
    await expect(page.locator("#signin-atproto-toggle")).toHaveCount(0);
  });
});
