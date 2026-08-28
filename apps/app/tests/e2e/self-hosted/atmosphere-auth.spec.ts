import { expect, test } from "@playwright/test";

/**
 * The Atmosphere (AT Protocol) entry points on the auth pages. This
 * instance has atproto configured (test keys) and every provider enabled,
 * so the full provider section renders: email form, then Atmosphere above
 * the generic OAuth button.
 *
 * No PDS is reachable from this environment, so specs cover the UI flow up
 * to the authorize call and its error surface; the full round trip is
 * covered by the release-gate matrix.
 */

test.describe("atmosphere sign-in entry", () => {
  test("renders above the generic OAuth button, below the email form", async ({
    page,
  }) => {
    await page.goto("/auth/sign-in");

    await expect(page.getByRole("button", { name: /login/i })).toBeVisible();
    const atmosphere = page.getByRole("button", {
      name: "Sign in with Atmosphere",
    });
    await expect(atmosphere).toBeVisible();
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

    await page.goto("/auth/sign-in");

    const handleInput = page.getByLabel("Atmosphere handle");
    // Retry the click until the handle step opens — the button renders
    // server-side but its onClick only attaches once React hydrates.
    await expect(async () => {
      await page
        .getByRole("button", { name: "Sign in with Atmosphere" })
        .click();
      await expect(handleInput).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15000 });
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
    await page.goto("/auth/sign-up");

    await expect(
      page.getByRole("button", { name: /create an account/i }),
    ).toBeVisible();
    const atmosphere = page.getByRole("button", {
      name: "Sign up with Atmosphere",
    });
    await expect(atmosphere).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sign up with TestOAuth" }),
    ).toBeVisible();

    const providerButtons = await page
      .getByRole("button", { name: /sign up with/i })
      .allTextContents();
    expect(providerButtons.indexOf("Sign up with Atmosphere")).toBeLessThan(
      providerButtons.indexOf("Sign up with TestOAuth"),
    );

    // Retry the click until the handle step opens — the button renders
    // server-side but its onClick only attaches once React hydrates.
    await expect(async () => {
      await atmosphere.click();
      await expect(page.getByLabel("Atmosphere handle")).toBeVisible({
        timeout: 1000,
      });
    }).toPass({ timeout: 15000 });
  });
});
