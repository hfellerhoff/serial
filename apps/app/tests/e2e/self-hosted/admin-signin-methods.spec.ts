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
 * sign-in method is an atproto DID. The authorize sign-up pre-flight lives
 * here too — this file owns provider-config mutation, so every mutator of
 * that shared instance state shares one worker.
 */

// Both describes mutate global provider config and restore it in
// afterEach; run this file's tests in order in one worker (without serial
// mode's skip-on-failure coupling) so they cannot interleave.
test.describe.configure({ mode: "default" });

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

    // The typeahead stays available to a signed-in caller (the connections
    // link form searches handles regardless of the sign-in toggle) while
    // the anonymous auth-page surface stays gated with the rest of atproto.
    const typeahead = await page.evaluate(async () => {
      const signedIn = await fetch("/api/auth/atproto/typeahead?q=alice");
      const anonymous = await fetch("/api/auth/atproto/typeahead?q=alice", {
        credentials: "omit",
      });
      return { signedIn: signedIn.status, anonymous: anonymous.status };
    });
    expect(typeahead.signedIn).toBe(200);
    expect(typeahead.anonymous).toBe(400);

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
    // Same budget as the label assertion above: the locked indicator only
    // appears once the settings refetch lands, which can straggle under
    // parallel-suite load.
    await expect(page.locator("#signin-atproto-toggle")).toHaveCount(0, {
      timeout: 30000,
    });
  });
});

/**
 * The authorize sign-up pre-flight: with atproto excluded from the sign-up
 * providers, an unknown DID is rejected before any authorize URL is
 * issued (no create-then-roll-back at the callback), while a DID with an
 * existing account row still gets past the sign-up gate. The pre-resolved
 * `did` body field keeps both requests hermetic — no identity resolution
 * leaves the instance before the gate runs.
 */
test.describe("atmosphere authorize sign-up pre-flight", () => {
  /** Exclude atproto from sign-up only; sign-in stays fully enabled. */
  async function excludeAtprotoFromSignup() {
    const client = createClient({
      url: `http://127.0.0.1:${SELF_HOSTED_TURSO_PORT}`,
    });
    try {
      await client.execute({
        sql: `INSERT INTO serial_app_config (key, value, updated_at)
              VALUES ('enabled-signup-providers', ?, unixepoch())
              ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        args: [JSON.stringify(["email", "oauth"])],
      });
    } finally {
      client.close();
    }
  }

  async function seedAtprotoAccount(did: string) {
    const client = createClient({
      url: `http://127.0.0.1:${SELF_HOSTED_TURSO_PORT}`,
    });
    const userId = createId();
    const now = Math.floor(Date.now() / 1000);
    try {
      await client.batch([
        {
          sql: `INSERT INTO serial_user (id, name, email, email_verified, image, created_at, updated_at)
                VALUES (?, 'Preflight Known', ?, 1, NULL, ?, ?)`,
          args: [userId, `preflight-known-${userId}@example.com`, now, now],
        },
        {
          sql: `INSERT INTO serial_account (id, account_id, provider_id, user_id, created_at, updated_at)
                VALUES (?, ?, 'atproto', ?, ?, ?)`,
          args: [createId(), did, userId, now, now],
        },
      ]);
    } finally {
      client.close();
    }
    return userId;
  }

  async function cleanupSeededUser(userId: string) {
    const client = createClient({
      url: `http://127.0.0.1:${SELF_HOSTED_TURSO_PORT}`,
    });
    try {
      await client.execute({
        sql: "DELETE FROM serial_user WHERE id = ?",
        args: [userId],
      });
    } finally {
      client.close();
    }
  }

  async function postAuthorize(page: Page, identifier: string, did: string) {
    return page.evaluate(
      async (body) => {
        const response = await fetch("/api/auth/atproto/authorize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        return {
          status: response.status,
          body: (await response.json()) as { message?: string },
        };
      },
      { identifier, did },
    );
  }

  test.afterEach(async () => {
    // Restore the global-setup provider state for other specs.
    await setEnabledAuthProviders(SELF_HOSTED_TURSO_PORT, [
      "email",
      "oauth",
      "atproto",
    ]);
  });

  test("rejects an unknown DID at authorize while atproto sign-up is unavailable", async ({
    page,
  }) => {
    test.setTimeout(120000);
    await excludeAtprotoFromSignup();
    await page.goto("/auth/sign-in");

    const rejected = await postAuthorize(
      page,
      "stranger.test",
      "did:plc:e2e-preflight-stranger",
    );
    expect(rejected.status).toBe(400);
    expect(rejected.body.message).toContain("Sign ups are currently disabled");
  });

  test("lets a known DID past the sign-up gate while sign-ups are unavailable", async ({
    page,
  }) => {
    test.setTimeout(120000);
    const did = "did:plc:e2e-preflight-known";
    const userId = await seedAtprotoAccount(did);
    try {
      await excludeAtprotoFromSignup();
      await page.goto("/auth/sign-in");

      // The gate passes; the flow then fails downstream in this PDS-less
      // environment. The exact generic authorize failure — asserting only
      // "not the signups-disabled message" would also pass if the sign-in
      // gate (wrongly) rejected the request first.
      const outcome = await postAuthorize(page, "known.test", did);
      expect(outcome.status).toBe(400);
      expect(outcome.body.message).toContain(
        "Could not start Atmosphere sign in",
      );
    } finally {
      await cleanupSeededUser(userId);
    }
  });
});
