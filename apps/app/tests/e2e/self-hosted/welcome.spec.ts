import { expect, test } from "@playwright/test";

test.describe("auth page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("shows auth page when not main instance", async ({ page }) => {
    // ?method=email opens the email subscreen when email is a secondary
    // method; with email primary it degrades to the inline form, so the
    // same URL works across instance flavors.
    await page.goto("/auth/sign-in?method=email");
    const loginButton = page.getByRole("button", { name: /login/i });
    const createAccountButton = page.getByRole("button", {
      name: /create an account/i,
    });

    // Depending on whether a user already exists, we may land on sign-in or sign-up
    await expect(loginButton.or(createAccountButton)).toBeVisible({
      timeout: 10000,
    });
  });
});
