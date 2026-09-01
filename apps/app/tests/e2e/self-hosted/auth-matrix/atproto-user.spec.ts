import { expect, test } from "@playwright/test";
import { seedSession, waitForReactHydration } from "../../fixtures/auth";
import { openSidebar } from "../../fixtures/sidebar";
import {
  SELF_HOSTED_APP_PORT,
  SELF_HOSTED_TURSO_PORT,
} from "../../fixtures/ports";
import { cleanupUser, seedAtprotoOnlyUser } from "../../fixtures/seed-db";
import type { Page } from "@playwright/test";

/**
 * Matrix cells for the Atmosphere-first user shape: the auth-page entry
 * points, the handle step, and a DID-only account's session. This shared
 * instance has atproto configured (test keys) and every provider enabled —
 * user-shape specs vary the account, never the instance config, so they
 * run in parallel with the rest of the suite. The typeahead proxy points
 * at the stub AppView fixture; no PDS is reachable, so flows are covered
 * up to the authorize call and DID-only sessions are seeded directly (the
 * rows plus a signed session cookie).
 */

/** Load an auth page until the Atmosphere button renders. */
async function gotoWithAtmosphere(
  page: Page,
  path: string,
  buttonName: string,
) {
  await page.goto(path);
  await expect(page.getByRole("button", { name: buttonName })).toBeVisible({
    timeout: 30000,
  });
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
  test("renders as a secondary method under the primary OAuth button", async ({
    page,
  }) => {
    await gotoWithAtmosphere(page, "/auth/sign-in", "Sign in with Atmosphere");

    // Display priority: oauth primary above the divider, then atmosphere
    // and email as secondaries in that order.
    const providerButtons = await page
      .getByRole("button", { name: /sign in with/i })
      .allTextContents();
    expect(providerButtons).toEqual([
      "Sign in with TestOAuth",
      "Sign in with Atmosphere",
      "Sign in with Email",
    ]);
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

    // Selecting swaps the input for the chosen account's card and threads
    // the DID into the authorize body as a resolution shortcut.
    await suggestions.getByText("Alice Test").click();
    await expect(
      page.getByRole("button", { name: "Choose a different account" }),
    ).toBeVisible();
    await expect(page.getByText("alice.test")).toBeVisible();
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
  test("renders as a secondary method with its own handle subscreen", async ({
    page,
  }) => {
    await gotoWithAtmosphere(page, "/auth/sign-up", "Sign up with Atmosphere");

    // Same display priority as sign-in: oauth primary, then atmosphere
    // and email secondaries.
    const providerButtons = await page
      .getByRole("button", { name: /sign up with/i })
      .allTextContents();
    expect(providerButtons).toEqual([
      "Sign up with TestOAuth",
      "Sign up with Atmosphere",
      "Sign up with Email",
    ]);

    await openHandleStep(page, "Sign up with Atmosphere");
  });
});

test.describe("DID-only session", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  let placeholderEmail: string | undefined;

  test.afterEach(async () => {
    if (placeholderEmail) {
      await cleanupUser(SELF_HOSTED_TURSO_PORT, placeholderEmail);
    }
  });

  test("a DID-only user's session reaches the app with the placeholder email suppressed", async ({
    page,
  }) => {
    test.setTimeout(120000);
    const seeded = await seedAtprotoOnlyUser(SELF_HOSTED_TURSO_PORT, {
      did: "did:plc:e2e-did-only-user",
      handle: "didonly.test",
      name: "DID Only User",
    });
    placeholderEmail = seeded.email;

    await seedSession({
      page,
      tursoPort: SELF_HOSTED_TURSO_PORT,
      userId: seeded.userId,
      baseUrl: `http://localhost:${SELF_HOSTED_APP_PORT}`,
    });

    await page.goto("/");
    await expect(page).toHaveURL("/", { timeout: 30000 });

    // The user menu shows the account; the internal placeholder address is
    // treated as "no email" and never rendered. The sidebar is offcanvas
    // (outside the viewport) until opened, and the toggle only works once
    // React hydrates.
    await waitForReactHydration(
      page.getByRole("button", { name: "Menu", exact: true }),
    );
    await openSidebar(page);
    const userButton = page
      .getByRole("button", { name: /DID Only User/ })
      .first();
    await expect(userButton).toBeInViewport({ timeout: 15000 });
    await userButton.click();
    await expect(page.getByText("atproto.invalid")).toHaveCount(0);
  });
});
