import { expect, test } from "@playwright/test";
import { signIn } from "../fixtures/auth";

/**
 * The unconfigured-instance flavor: this app server starts without the
 * ATPROTO_* keys, so atproto soft-disables at the env level — no plugin
 * mount, no buttons, no typeahead — even though the database's
 * enabled-provider rows list atproto (global setup enables all three).
 * The soft-disable must win over DB enablement everywhere.
 */

test.describe("atproto-unconfigured instance", () => {
  test("auth pages render no Atmosphere entry despite DB enablement", async ({
    page,
  }) => {
    await page.goto("/auth/sign-in");

    // OAuth stays primary and email secondary; Atmosphere is absent.
    await expect(
      page.getByRole("button", { name: "Sign in with TestOAuth" }),
    ).toBeVisible({ timeout: 15000 });
    const signinButtons = await page
      .getByRole("button", { name: /sign in with/i })
      .allTextContents();
    expect(signinButtons).toEqual([
      "Sign in with TestOAuth",
      "Sign in with Email",
    ]);

    await page.goto("/auth/sign-up");
    await expect(
      page.getByRole("button", { name: "Sign up with TestOAuth" }),
    ).toBeVisible({ timeout: 15000 });
    const signupButtons = await page
      .getByRole("button", { name: /sign up with/i })
      .allTextContents();
    expect(signupButtons).toEqual([
      "Sign up with TestOAuth",
      "Sign up with Email",
    ]);
  });

  test("atproto endpoints are absent, not just gated", async ({ page }) => {
    await page.goto("/auth/sign-in");

    // No plugin mount: the routes don't exist, rather than answering 400
    // like a disabled-but-configured provider would.
    const statuses = await page.evaluate(async () => {
      const authorize = await fetch("/api/auth/atproto/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: "example.bsky.social" }),
      });
      const typeahead = await fetch("/api/auth/atproto/typeahead?q=alice");
      return { authorize: authorize.status, typeahead: typeahead.status };
    });
    expect(statuses.authorize).toBe(404);
    expect(statuses.typeahead).toBe(404);
  });

  test("admin method settings hide the Atmosphere toggles", async ({
    page,
  }) => {
    test.setTimeout(120000);
    await signIn({
      page,
      email: "e2e-harness-admin@example.com",
      password: "testpassword123",
    });
    await page.goto("/admin/settings");

    // The sign-up email toggle proves the section rendered (the sign-in
    // email toggle is locked here — it's the seeded admin's only method);
    // the Atmosphere rows are gated on instance configuration and never
    // appear.
    await expect(page.locator("#signup-email-toggle")).toBeVisible({
      timeout: 30000,
    });
    await expect(page.locator("#signin-atproto-toggle")).toHaveCount(0);
    await expect(page.locator("#signup-atproto-toggle")).toHaveCount(0);
  });
});
