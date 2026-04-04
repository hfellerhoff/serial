import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

interface SignUpOptions {
  page: Page;
  name: string;
  email: string;
  password: string;
}

interface SignInOptions {
  page: Page;
  email: string;
  password: string;
}

/**
 * Detects whether the page is on sign-in or sign-up and returns the current
 * auth page type, or null if neither is detected.
 */
async function detectAuthPage(page: Page): Promise<"sign-in" | "sign-up"> {
  // Wait for one of the two forms to appear
  const loginButton = page.getByRole("button", { name: /login/i });
  const createAccountButton = page.getByRole("button", {
    name: /create an account/i,
  });

  const result = await Promise.race([
    loginButton
      .waitFor({ state: "visible", timeout: 10000 })
      .then(() => "sign-in" as const),
    createAccountButton
      .waitFor({ state: "visible", timeout: 10000 })
      .then(() => "sign-up" as const),
  ]);

  return result;
}

/**
 * Signs up a new user, handling the case where the page may land on
 * sign-in instead of sign-up (e.g. if a user already exists and the app
 * redirects differently).
 */
export async function signUp({ page, name, email, password }: SignUpOptions) {
  await page.goto("/auth/sign-up");

  const authPage = await detectAuthPage(page);

  if (authPage === "sign-in") {
    // We landed on sign-in but need sign-up — click the "Sign up" link
    await page.getByRole("link", { name: /sign up/i }).click();
    await expect(
      page.getByRole("button", { name: /create an account/i }),
    ).toBeVisible({ timeout: 10000 });
  }

  await page.locator("#first-name").pressSequentially(name, { delay: 50 });
  await page.locator("#email").pressSequentially(email, { delay: 50 });
  await page.locator("#password").pressSequentially(password, { delay: 50 });
  await page
    .locator("#password_confirmation")
    .pressSequentially(password, { delay: 50 });

  await page.getByRole("button", { name: /create an account/i }).click();
  await expect(page).toHaveURL("/", { timeout: 30000 });
}

/**
 * Signs in an existing user, handling the case where the page may land on
 * sign-up instead of sign-in (e.g. if no users exist yet and the app
 * redirects to the first-user sign-up flow).
 */
export async function signIn({ page, email, password }: SignInOptions) {
  await page.goto("/auth/sign-in");

  const authPage = await detectAuthPage(page);

  if (authPage === "sign-up") {
    // We landed on sign-up but need sign-in — click the "Sign in" link
    await page.getByRole("link", { name: /sign in/i }).click();
    await expect(page.getByRole("button", { name: /login/i })).toBeVisible({
      timeout: 10000,
    });
  }

  await expect(page.locator("#email")).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(1000);
  await page.locator("#email").pressSequentially(email, { delay: 50 });
  await page.locator("#password").pressSequentially(password, { delay: 50 });

  await Promise.all([
    page.waitForURL("/", { timeout: 30000 }),
    page.getByRole("button", { name: /login/i }).click(),
  ]);
}
