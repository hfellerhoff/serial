import { expect, test } from "@playwright/test";

/**
 * The zero-user bootstrap instance must offer Atmosphere for the initial
 * admin account: the first-user config path exposes every configured
 * provider, and the post-auth policy records the first admin's own method.
 * Runs before first-admin.spec (serial project, alphabetical order) and
 * must not create any user.
 */

test("first-admin sign-up offers Atmosphere alongside email", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/auth\/sign-up/);
  await expect(page.getByText("Admin Account Creation")).toBeVisible();

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
