import { expect, test } from "@playwright/test";
import { SELF_HOSTED_TURSO_PORT } from "../../fixtures/ports";
import { cleanupUser, generateTestEmail } from "../../fixtures/seed-db";
import {
  signIn,
  signOut,
  signUp,
  waitForReactHydration,
} from "../../fixtures/auth";

/**
 * Matrix cells for the credential-only user shape: email sign-up, sign
 * out, and sign back in with the same credentials. Every other spec leans
 * on these flows through the fixtures; this cell asserts the round trip
 * on its own terms so a credential regression fails here first, by name.
 * (Verification gating lives on the email-enabled config instance;
 * invitation sign-up keeps its own spec in invite-flow.spec.ts.)
 */

test.describe("credential-only user", () => {
  let testEmail: string;

  test.afterEach(async () => {
    if (testEmail) {
      await cleanupUser(SELF_HOSTED_TURSO_PORT, testEmail);
    }
  });

  test("signs up, signs out, and signs back in with email and password", async ({
    page,
  }) => {
    test.setTimeout(90000);
    testEmail = generateTestEmail();
    const password = "password123";

    await signUp({
      page,
      name: "Credential Tester",
      email: testEmail,
      password,
    });
    await expect(page).toHaveURL("/");

    await signOut(page);
    await signIn({ page, email: testEmail, password });
    await expect(page).toHaveURL("/");

    // The wrong password is refused server-side and the page stays on
    // sign-in (the UI surfaces no toast for a plain invalid login — it
    // only branches into the legacy-user reset flow), so the round trip
    // above proved the right one.
    await signOut(page);
    await page.goto("/auth/sign-in?method=email");
    await expect(page.locator("#email")).toBeVisible({ timeout: 15000 });
    const loginButton = page.getByRole("button", { name: /login/i });
    await waitForReactHydration(loginButton);
    await page.locator("#email").fill(testEmail);
    await page.locator("#password").fill("wrong-password-1");
    const signInResponse = page.waitForResponse(
      (response) => response.url().includes("/api/auth/sign-in/email"),
      { timeout: 15000 },
    );
    await loginButton.click();
    expect((await signInResponse).status()).toBe(401);
    await expect(page).toHaveURL(/\/auth\/sign-in/);
  });
});
