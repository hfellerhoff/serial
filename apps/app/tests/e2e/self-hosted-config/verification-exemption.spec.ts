import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { seedSession, waitForReactHydration } from "../fixtures/auth";
import { openSidebar } from "../fixtures/sidebar";
import { getTestClientIp, TEST_CLIENT_IP_HEADER } from "../fixtures/client-ip";
import {
  SELF_HOSTED_CONFIG_APP_PORT,
  SELF_HOSTED_CONFIG_TURSO_PORT,
  SELF_HOSTED_EMAIL_SERVER_PORT,
} from "../fixtures/ports";
import {
  cleanupUser,
  generateTestEmail,
  seedAtprotoOnlyUser,
} from "../fixtures/seed-db";
import { setEnabledAuthProviders } from "../fixtures/set-enabled-auth-providers";

/**
 * Email-verification scoping across user shapes. This is the one instance
 * with email transport enabled (the stub Resend server captures every
 * send), so the forced /auth/verify-email redirect is live here: a
 * credential sign-up is gated until the emailed OTP is entered, while a
 * DID-only Atmosphere user is exempt and lands straight in the app with
 * the internal placeholder email never surfaced.
 */

/** Read the latest 6-digit OTP the stub Resend server captured for an address. */
async function fetchLatestOtp(recipient: string) {
  let otp: string | undefined;
  await expect
    .poll(
      async () => {
        const response = await fetch(
          `http://127.0.0.1:${SELF_HOSTED_EMAIL_SERVER_PORT}/e2e/emails?to=${encodeURIComponent(recipient)}`,
        );
        const { emails } = (await response.json()) as {
          emails: Array<{ html?: string }>;
        };
        for (const email of emails.reverse()) {
          // The OTP is the letter-spaced code element's entire text node;
          // matching an element-delimited token keeps a stray 6-digit
          // sequence elsewhere in the document from hijacking the code.
          const match = />(\d{6})</.exec(email.html ?? "");
          if (match) {
            otp = match[1];
            return true;
          }
        }
        return false;
      },
      { timeout: 20000 },
    )
    .toBe(true);
  return otp!;
}

test.describe("email verification scoping", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  let credentialEmail: string;
  let atprotoEmail: string | undefined;

  test.beforeEach(async () => {
    // Own the baseline instead of inheriting it from the other config
    // specs' afterEach restores — a hard worker crash elsewhere must not
    // leak a partial provider set into this spec.
    await setEnabledAuthProviders(SELF_HOSTED_CONFIG_TURSO_PORT, [
      "email",
      "oauth",
      "atproto",
    ]);
  });

  test.afterEach(async () => {
    if (credentialEmail) {
      await cleanupUser(SELF_HOSTED_CONFIG_TURSO_PORT, credentialEmail);
    }
    if (atprotoEmail) {
      await cleanupUser(SELF_HOSTED_CONFIG_TURSO_PORT, atprotoEmail);
    }
  });

  test("credential sign-up is gated until the emailed code verifies", async ({
    page,
  }) => {
    test.setTimeout(120000);
    credentialEmail = generateTestEmail();
    await page.setExtraHTTPHeaders({
      [TEST_CLIENT_IP_HEADER]: getTestClientIp(credentialEmail),
    });

    await page.goto("/auth/sign-up?method=email");
    const createAccountButton = page.getByRole("button", {
      name: /create an account/i,
    });
    await expect(createAccountButton).toBeVisible({ timeout: 15000 });
    await waitForReactHydration(createAccountButton);
    await page.locator("#first-name").fill("Gated Credential");
    await page.locator("#email").fill(credentialEmail);
    await page.locator("#password").fill("testpassword123");
    await page.locator("#password_confirmation").fill("testpassword123");
    await createAccountButton.click();

    // Unverified credential session: forced onto the verification screen.
    await page.waitForURL(/\/auth\/verify-email/, { timeout: 30000 });

    // The app shell stays out of reach until verification.
    await page.goto("/");
    await page.waitForURL(/\/auth\/verify-email/, { timeout: 30000 });

    // Enter the OTP the stub email server captured.
    const otp = await fetchLatestOtp(credentialEmail);
    await page.getByPlaceholder("Enter code").fill(otp);
    await page.getByRole("button", { name: "Verify", exact: true }).click();
    await page.waitForURL("/", { timeout: 30000 });
  });

  test("a DID-only Atmosphere user is exempt and never shows the placeholder email", async ({
    page,
  }) => {
    test.setTimeout(120000);
    credentialEmail = "";
    const seeded = await seedAtprotoOnlyUser(SELF_HOSTED_CONFIG_TURSO_PORT, {
      did: `did:plc:e2e${randomBytes(6).toString("hex")}`,
      handle: "exempt.test",
      name: "Exempt Atmosphere User",
    });
    atprotoEmail = seeded.email;

    await seedSession({
      page,
      tursoPort: SELF_HOSTED_CONFIG_TURSO_PORT,
      userId: seeded.userId,
      baseUrl: `http://localhost:${SELF_HOSTED_CONFIG_APP_PORT}`,
    });

    // Exempt: the unverified email never forces the verification screen.
    await page.goto("/");
    await expect(page).toHaveURL("/", { timeout: 30000 });

    // The user menu shows the account; its internal placeholder address is
    // treated as "no email" and never rendered. The sidebar is offcanvas
    // (outside the viewport) until opened, and the toggle only works once
    // React hydrates.
    await waitForReactHydration(
      page.getByRole("button", { name: "Menu", exact: true }),
    );
    await openSidebar(page);
    const userButton = page
      .getByRole("button", { name: /Exempt Atmosphere User/ })
      .first();
    await expect(userButton).toBeInViewport({ timeout: 15000 });
    await userButton.click();
    // The open menu anchors the absence check — without it the count-0
    // assertion would pass vacuously before the dropdown rendered.
    await expect(
      page.getByRole("menuitem", { name: "Connections" }),
    ).toBeVisible();
    await expect(page.getByText("atproto.invalid")).toHaveCount(0);
  });
});
