import { expect, test } from "@playwright/test";
import { resetDb } from "../fixtures/reset-db";

test.describe("auth page", () => {
  test.beforeEach(async ({ page }) => {
    await resetDb(8082);
    await page.goto("/");
  });

  test("shows auth page when not main instance", async ({ page }) => {
    await page.goto("/auth/sign-in");
    const loginButton = page.getByRole("button", { name: /login/i });
    await expect(loginButton).toBeVisible({ timeout: 10000 });
  });
});
