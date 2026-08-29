import { expect, test } from "@playwright/test";
import { signIn, signOut, signUp } from "../fixtures/auth";

test.describe.configure({ mode: "serial" });

// Runs before the sign-up test below (serial mode, file order) so the
// zero-user instance still exists: the first-user config path must offer
// Atmosphere for the initial admin account, and the post-auth policy
// records whichever method the first admin actually uses.
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

  const handleInput = page.getByLabel("Atmosphere handle");
  // Retry the click until the handle step opens — the button renders
  // server-side but its onClick only attaches once React hydrates.
  await expect(async () => {
    if (await handleInput.isVisible()) return;
    await atmosphere.click();
    await expect(handleInput).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15000 });
});

test("first administrator can sign up and return after a reload", async ({
  page,
}) => {
  const email = "first-admin@example.com";
  const password = "testpassword123";

  await page.goto("/");
  await expect(page).toHaveURL(/\/auth\/sign-up/);
  await expect(page.getByText("Admin Account Creation")).toBeVisible();

  await signUp({
    page,
    name: "First Admin",
    email,
    password,
  });
  await expect(page.getByRole("heading", { name: "Serial" })).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "Serial" })).toBeVisible();

  await page.goto("/admin/settings");
  await expect(page).toHaveURL("/admin/settings");
  await expect(page.getByText("Sign-up methods")).toBeVisible();

  await signOut(page);
  await signIn({ page, email, password });
  await expect(page.getByRole("heading", { name: "Serial" })).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "Serial" })).toBeVisible();
});
