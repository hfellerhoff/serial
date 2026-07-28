import { expect, test } from "@playwright/test";

test.describe("auth page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("shows auth page when not main instance", async ({ page }) => {
    await page.goto("/auth/sign-in");
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
