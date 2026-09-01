import { expect, test } from "@playwright/test";
import { SELF_HOSTED_CONFIG_TURSO_PORT } from "../fixtures/ports";
import { setEnabledAuthProviders } from "../fixtures/set-enabled-auth-providers";

/**
 * Provider presentation per enabled set: for a given enabled-provider
 * configuration, the auth pages render the highest-priority provider
 * (oauth > atproto > email) inline as the primary method with the rest as
 * secondary subscreen buttons, and the server-side gates agree with the
 * buttons. This instance's database belongs to this serial project, so a
 * beforeEach-configured set holds for the whole test with nothing else
 * mutating or asserting it.
 */

test.afterEach(async () => {
  // Restore the global-setup provider state for the other config specs.
  await setEnabledAuthProviders(SELF_HOSTED_CONFIG_TURSO_PORT, [
    "email",
    "oauth",
    "atproto",
  ]);
});

test("email-only set renders the inline form alone and gates atproto server-side", async ({
  page,
}) => {
  await setEnabledAuthProviders(SELF_HOSTED_CONFIG_TURSO_PORT, ["email"]);
  await page.goto("/auth/sign-in");

  // Email is the only method, so its form renders inline with no divider
  // and no provider buttons.
  await expect(page.locator("#email")).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("button", { name: /sign in with/i })).toHaveCount(
    0,
  );
  await expect(page.getByText("or", { exact: true })).not.toBeVisible();

  // The atproto authorize endpoint is gated with the button absent.
  const response = await page.evaluate(async () => {
    const result = await fetch("/api/auth/atproto/authorize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "example.bsky.social" }),
    });
    return {
      status: result.status,
      body: (await result.json()) as { message?: string },
    };
  });
  expect(response.status).toBe(400);
  expect(response.body.message).toContain(
    "Atmosphere sign in is currently disabled",
  );
});

test("email-and-atproto set promotes Atmosphere to the primary method", async ({
  page,
}) => {
  await setEnabledAuthProviders(SELF_HOSTED_CONFIG_TURSO_PORT, [
    "email",
    "atproto",
  ]);
  await page.goto("/auth/sign-in");

  // Atmosphere outranks email, so its handle field renders inline —
  // expanded, no extra click — and email drops to a secondary button.
  await expect(page.getByLabel("Atmosphere handle")).toBeVisible({
    timeout: 15000,
  });
  const secondaryButtons = await page
    .getByRole("button", { name: /sign in with/i })
    .allTextContents();
  expect(secondaryButtons).toEqual(["Sign in with Email"]);
});

test("full set renders oauth primary with Atmosphere and email secondaries on both pages", async ({
  page,
}) => {
  await setEnabledAuthProviders(SELF_HOSTED_CONFIG_TURSO_PORT, [
    "email",
    "oauth",
    "atproto",
  ]);

  await page.goto("/auth/sign-in");
  await expect(
    page.getByRole("button", { name: "Sign in with TestOAuth" }),
  ).toBeVisible({ timeout: 15000 });
  const signinButtons = await page
    .getByRole("button", { name: /sign in with/i })
    .allTextContents();
  expect(signinButtons).toEqual([
    "Sign in with TestOAuth",
    "Sign in with Atmosphere",
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
    "Sign up with Atmosphere",
    "Sign up with Email",
  ]);

  // The secondary Atmosphere entry opens its handle subscreen. The button
  // renders server-side but its onClick only attaches once React hydrates,
  // so retry the click until it takes.
  const handleInput = page.getByLabel("Atmosphere handle");
  await expect(async () => {
    if (await handleInput.isVisible()) return;
    await page.getByRole("button", { name: "Sign up with Atmosphere" }).click();
    await expect(handleInput).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15000 });
});
