import { readFileSync } from "node:fs";
import { expect } from "@playwright/test";
import { createClient } from "@libsql/client";
import { createId } from "@paralleldrive/cuid2";
import { hashPassword, makeSignature } from "better-auth/crypto";
import { getTestClientIp, TEST_CLIENT_IP_HEADER } from "./client-ip";
import type { Locator, Page } from "@playwright/test";

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

interface SeedAdminOptions {
  tursoPort: number;
  name: string;
  email: string;
  password: string;
}

export async function waitForReactHydration(locator: Locator) {
  await expect
    .poll(
      () =>
        locator.evaluate((element) =>
          Object.keys(element).some((key) => key.startsWith("__reactProps$")),
        ),
      { timeout: 10000 },
    )
    .toBe(true);
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
  await page.setExtraHTTPHeaders({
    [TEST_CLIENT_IP_HEADER]: getTestClientIp(email),
  });
  // ?method=email opens the email subscreen when email is a secondary
  // method (atproto/oauth primary); with email primary it degrades to the
  // inline form, so the same URL works across instance flavors.
  await page.goto("/auth/sign-up?method=email");

  const authPage = await detectAuthPage(page);

  if (authPage === "sign-in") {
    // We landed on sign-in but need sign-up — click the "Sign up" link
    await page.getByRole("link", { name: /sign up/i }).click();
    await expect(
      page.getByRole("button", { name: /create an account/i }),
    ).toBeVisible({ timeout: 10000 });
  }

  const createAccountButton = page.getByRole("button", {
    name: /create an account/i,
  });
  await waitForReactHydration(createAccountButton);
  await page.locator("#first-name").fill(name);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator("#password_confirmation").fill(password);

  await createAccountButton.click();
  await expect(page).toHaveURL("/", { timeout: 30000 });
}

/**
 * Seeds an admin user directly in the database, bypassing the UI sign-up flow.
 *
 * This avoids race conditions in parallel tests where two tests both try to
 * sign up as the "first user" — only one would get admin via the after-hook.
 * By inserting directly into the DB with role="admin" and the correct appConfig
 * entries, the user is guaranteed to be admin regardless of execution order.
 */
export async function seedAdmin({
  tursoPort,
  name,
  email,
  password,
}: SeedAdminOptions) {
  const client = createClient({ url: `http://127.0.0.1:${tursoPort}` });
  const now = Math.floor(Date.now() / 1000);
  const userId = createId();
  const accountId = createId();
  const hashed = await hashPassword(password);

  await client.batch([
    // Insert user with admin role
    {
      sql: `INSERT INTO serial_user (id, name, email, email_verified, image, created_at, updated_at, role)
            VALUES (?, ?, ?, 1, NULL, ?, ?, 'admin')`,
      args: [userId, name, email, now, now],
    },
    // Insert credential account so sign-in works
    {
      sql: `INSERT INTO serial_account (id, account_id, provider_id, user_id, password, created_at, updated_at)
            VALUES (?, ?, 'credential', ?, ?, ?, ?)`,
      args: [accountId, userId, userId, hashed, now, now],
    },
    // Ensure the provider lists exist without clobbering them: specs call
    // this mid-suite, and global setup owns the actual enabled set.
    {
      sql: `INSERT OR IGNORE INTO serial_app_config (key, value, updated_at)
            VALUES ('enabled-signin-providers', '["email"]', ?)`,
      args: [now],
    },
    {
      sql: `INSERT OR IGNORE INTO serial_app_config (key, value, updated_at)
            VALUES ('enabled-signup-providers', '["email"]', ?)`,
      args: [now],
    },
  ]);

  client.close();
}

/**
 * Seeds an admin user directly in the DB then signs in via the UI.
 * Use this instead of signUp when the test needs guaranteed admin access,
 * regardless of parallel test execution order.
 */
export async function signUpAsAdmin({
  page,
  tursoPort,
  name,
  email,
  password,
}: SeedAdminOptions & { page: Page }) {
  await seedAdmin({ tursoPort, name, email, password });
  await signIn({ page, email, password });
}

/**
 * The committed test secret, read from the same env file the app servers
 * load so a secret change cannot silently desynchronize the fixture.
 */
function readTestBetterAuthSecret() {
  const envFile = readFileSync(
    new URL("../../../.env.test.self-hosted", import.meta.url),
    "utf8",
  );
  const secret = /^BETTER_AUTH_SECRET=(.+)$/m.exec(envFile)?.[1];
  if (!secret) {
    throw new Error("BETTER_AUTH_SECRET not found in .env.test.self-hosted");
  }
  return secret;
}

async function signSessionCookie(token: string) {
  const signature = await makeSignature(token, readTestBetterAuthSecret());
  return encodeURIComponent(`${token}.${signature}`);
}

/**
 * Seeds a session row for a user and hands its signed cookie to the page,
 * signing the user in without any auth flow. This is how DID-only users
 * get a browser session in e2e — their real sign-in needs an OAuth round
 * trip against a live PDS, which stays out of this environment.
 */
export async function seedSession({
  page,
  tursoPort,
  userId,
  baseUrl,
}: {
  page: Page;
  tursoPort: number;
  userId: string;
  baseUrl: string;
}) {
  const client = createClient({ url: `http://127.0.0.1:${tursoPort}` });
  const now = Math.floor(Date.now() / 1000);
  const token = createId();
  await client.execute({
    sql: `INSERT INTO serial_session (id, token, user_id, expires_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [createId(), token, userId, now + 7 * 24 * 60 * 60, now, now],
  });
  client.close();
  await page.context().addCookies([
    {
      name: "better-auth.session_token",
      value: await signSessionCookie(token),
      url: baseUrl,
    },
  ]);
}

/**
 * Signs out the current user. Better Auth's sign-out endpoint is POST-only,
 * so navigating to /api/auth/sign-out with page.goto does NOT clear the
 * session — this helper issues a real POST through the page's cookie jar.
 */
export async function signOut(page: Page) {
  const result = await page.evaluate(async () => {
    const response = await fetch("/api/auth/sign-out", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    return { ok: response.ok, status: response.status };
  });
  expect(result.ok, `sign-out failed with status ${result.status}`).toBe(true);
}

/**
 * Signs in an existing user, handling the case where the page may land on
 * sign-up instead of sign-in (e.g. if no users exist yet and the app
 * redirects to the first-user sign-up flow).
 */
export async function signIn({ page, email, password }: SignInOptions) {
  await page.setExtraHTTPHeaders({
    [TEST_CLIENT_IP_HEADER]: getTestClientIp(email),
  });
  await page.goto("/auth/sign-in?method=email");

  const authPage = await detectAuthPage(page);

  if (authPage === "sign-up") {
    // We landed on sign-up but need sign-in — click the "Sign in" link
    await page.getByRole("link", { name: /sign in/i }).click();
    await expect(page.getByRole("button", { name: /login/i })).toBeVisible({
      timeout: 10000,
    });
  }

  await expect(page.locator("#email")).toBeVisible({ timeout: 10000 });
  const loginButton = page.getByRole("button", { name: /login/i });
  await waitForReactHydration(loginButton);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);

  await Promise.all([
    page.waitForURL("/", { timeout: 30000 }),
    loginButton.click(),
  ]);
}
