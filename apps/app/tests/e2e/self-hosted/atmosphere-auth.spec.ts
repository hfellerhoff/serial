import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

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
