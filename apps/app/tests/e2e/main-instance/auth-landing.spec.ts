import { expect, test } from "@playwright/test";

test("homepage redirects signed-out visitors to the auth page", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Serial/i);

  // The marketing site is a separate deployable; the app sends signed-out
  // visitors straight to auth.
  await expect(page).toHaveURL(/auth/, { timeout: 10000 });
  const loginButton = page.getByRole("button", { name: /login/i });
  const createAccountButton = page.getByRole("button", {
    name: /create an account/i,
  });
  await expect(loginButton.or(createAccountButton)).toBeVisible({
    timeout: 10000,
  });
});
