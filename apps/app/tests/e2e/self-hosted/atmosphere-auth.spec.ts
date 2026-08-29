import { expect, test } from "@playwright/test";
import { createClient } from "@libsql/client";
import { createId } from "@paralleldrive/cuid2";
import { SELF_HOSTED_TURSO_PORT } from "../fixtures/ports";
import { setEnabledAuthProviders } from "../fixtures/set-enabled-auth-providers";
import type { Page } from "@playwright/test";

// The pre-flight describe below mutates the global signup-provider config
// while other describes in this file assert the Atmosphere buttons render,
// so this file opts out of fullyParallel: its tests run in order in one
// worker (without serial mode's skip-on-failure coupling).
test.describe.configure({ mode: "default" });

/**
 * The Atmosphere (AT Protocol) entry points on the auth pages. This
 * instance has atproto configured (test keys) and every provider enabled,
 * so the full provider section renders: email form, then Atmosphere above
 * the generic OAuth button. The typeahead proxy points at the stub AppView
 * fixture, keeping suggestion specs hermetic.
 *
 * No PDS is reachable from this environment, so specs cover the UI flow up
 * to the authorize call and its error surface; the full round trip is
 * covered by the release-gate matrix.
 */

/**
 * Load an auth page until the Atmosphere button renders. Ordinarily one
 * load suffices; the retry rides out the brief window in which
 * admin-signin-methods.spec.ts (same parallel project, shared database)
 * has Atmosphere sign-in toggled off.
 */
async function gotoWithAtmosphere(
  page: Page,
  path: string,
  buttonName: string,
) {
  await expect(async () => {
    await page.goto(path);
    await expect(page.getByRole("button", { name: buttonName })).toBeVisible({
      timeout: 3000,
    });
  }).toPass({ timeout: 45000 });
}

/**
 * Open the handle step, retrying the click until it takes — the button
 * renders server-side but its onClick only attaches once React hydrates.
 */
async function openHandleStep(page: Page, buttonName: string) {
  const handleInput = page.getByLabel("Atmosphere handle");
  await expect(async () => {
    if (await handleInput.isVisible()) return;
    await page.getByRole("button", { name: buttonName }).click();
    await expect(handleInput).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15000 });
  return handleInput;
}

test.describe("atmosphere sign-in entry", () => {
  test("renders above the generic OAuth button, below the email form", async ({
    page,
  }) => {
    await gotoWithAtmosphere(page, "/auth/sign-in", "Sign in with Atmosphere");

    await expect(page.getByRole("button", { name: /login/i })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sign in with TestOAuth" }),
    ).toBeVisible();

    const providerButtons = await page
      .getByRole("button", { name: /sign in with/i })
      .allTextContents();
    expect(providerButtons.indexOf("Sign in with Atmosphere")).toBeLessThan(
      providerButtons.indexOf("Sign in with TestOAuth"),
    );
  });

  test("opens the handle step and keeps typed input submittable", async ({
    page,
  }) => {
    const thirdPartyRequests: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
        thirdPartyRequests.push(request.url());
      }
    });

    await gotoWithAtmosphere(page, "/auth/sign-in", "Sign in with Atmosphere");
    const handleInput = await openHandleStep(page, "Sign in with Atmosphere");
    await expect(handleInput).toBeFocused();

    // Keystrokes only ever reach the Serial proxy, never an AppView.
    const typeaheadRequest = page.waitForRequest(
      (request) => request.url().includes("/api/auth/atproto/typeahead"),
      { timeout: 5_000 },
    );
    await handleInput.fill("no-such-handle.serial-e2e.invalid");
    await typeaheadRequest;
    expect(thirdPartyRequests).toEqual([]);

    // No suggestions resolved, so typed input stays authoritative; an
    // unresolvable handle surfaces the authorize error in place.
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(
      page.getByText(/could not start atmosphere sign in/i),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(/\/auth\/sign-in/);
  });

  test("shows suggestions and threads the selected DID to authorize", async ({
    page,
  }) => {
    await gotoWithAtmosphere(page, "/auth/sign-in", "Sign in with Atmosphere");
    const handleInput = await openHandleStep(page, "Sign in with Atmosphere");

    // Two characters are enough to surface stub-AppView suggestions.
    await handleInput.fill("al");
    const suggestions = page.getByLabel("Suggested accounts");
    await expect(suggestions.getByText("Alice Test")).toBeVisible();
    await expect(suggestions.getByText("alice.test")).toBeVisible();
    await expect(suggestions.getByText("Alina Test")).toBeVisible();

    // Selecting fills the input and threads the DID into the authorize
    // body as a resolution shortcut.
    await suggestions.getByText("Alice Test").click();
    await expect(handleInput).toHaveValue("alice.test");
    await expect(suggestions).not.toBeVisible();

    const authorizeRequest = page.waitForRequest(
      (request) => request.url().includes("/api/auth/atproto/authorize"),
      { timeout: 10_000 },
    );
    await page.getByRole("button", { name: "Continue" }).click();
    const request = await authorizeRequest;
    expect(request.postDataJSON()).toEqual({
      identifier: "alice.test",
      did: "did:plc:e2e-alice",
    });
  });

  test("surfaces a failed callback redirect as a toast", async ({ page }) => {
    await page.goto("/auth/sign-in?error=atproto");
    await expect(
      page.getByText("Atmosphere authentication failed. Please try again."),
    ).toBeVisible();
    // The error param is consumed so a reload doesn't re-toast.
    await expect(page).toHaveURL(/\/auth\/sign-in$/);
  });
});

test.describe("atmosphere sign-up entry", () => {
  test("renders above the generic OAuth button with its own handle step", async ({
    page,
  }) => {
    await gotoWithAtmosphere(page, "/auth/sign-up", "Sign up with Atmosphere");

    await expect(
      page.getByRole("button", { name: /create an account/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sign up with TestOAuth" }),
    ).toBeVisible();

    const providerButtons = await page
      .getByRole("button", { name: /sign up with/i })
      .allTextContents();
    expect(providerButtons.indexOf("Sign up with Atmosphere")).toBeLessThan(
      providerButtons.indexOf("Sign up with TestOAuth"),
    );

    await openHandleStep(page, "Sign up with Atmosphere");
  });
});

/**
 * The authorize pre-flight: with atproto excluded from the sign-up
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

      // The gate passes; the flow then fails downstream in this
      // PDS-less environment with the generic authorize error, never the
      // sign-ups-disabled rejection.
      const outcome = await postAuthorize(page, "known.test", did);
      expect(outcome.status).toBe(400);
      // The exact generic authorize failure — asserting only "not the
      // signups-disabled message" would also pass if the sign-in gate
      // (wrongly) rejected the request first.
      expect(outcome.body.message).toContain(
        "Could not start Atmosphere sign in",
      );
    } finally {
      await cleanupSeededUser(userId);
    }
  });
});
