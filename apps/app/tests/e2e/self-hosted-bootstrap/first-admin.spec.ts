import { expect, test } from "@playwright/test";
import { signIn, signOut, signUp } from "../fixtures/auth";

test.describe.configure({ mode: "serial" });

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
