import { expect, test } from "@playwright/test";
import { signIn, signUpAsAdmin } from "../fixtures/auth";
import { SELF_HOSTED_TURSO_PORT } from "../fixtures/ports";
import { cleanupUser, generateTestEmail } from "../fixtures/seed-db";
import type { Page } from "@playwright/test";

/**
 * Clear the React Query persisted cache from localStorage.
 *
 * The app uses PersistQueryClientProvider which caches query results in
 * localStorage. Combined with a 30-second staleTime, this means navigating
 * back to a page within 30 seconds serves the persisted (stale) data without
 * refetching. In tests where we sign out / sign in and expect fresh data, we
 * must clear this cache to force a server round-trip.
 */
async function clearQueryCache(page: Page) {
  await page.evaluate(() => {
    try {
      localStorage.removeItem("REACT_QUERY_OFFLINE_CACHE");
    } catch {
      // localStorage may not be available in some contexts
    }
  });
}

test.describe("invite flow", () => {
  // Run serially — both tests share the same DB and listInvitations returns
  // ALL invitations, so parallel execution causes cross-test interference.
  test.describe.configure({ mode: "serial" });

  let adminEmail: string;
  let invitedEmail: string;
  let invitedEmail2: string;

  test.afterEach(async () => {
    if (invitedEmail2) {
      await cleanupUser(SELF_HOSTED_TURSO_PORT, invitedEmail2);
    }
    if (invitedEmail) {
      await cleanupUser(SELF_HOSTED_TURSO_PORT, invitedEmail);
    }
    if (adminEmail) {
      await cleanupUser(SELF_HOSTED_TURSO_PORT, adminEmail);
    }
  });

  test("admin creates invite link, multiple users can sign up with it", async ({
    page,
  }) => {
    test.setTimeout(180000);
    adminEmail = generateTestEmail();
    invitedEmail = generateTestEmail();
    invitedEmail2 = generateTestEmail();
    const password = "testpassword123";

    // ── 1. Seed admin user directly in DB and sign in ────────────────
    await signUpAsAdmin({
      page,
      tursoPort: SELF_HOSTED_TURSO_PORT,
      name: "Admin User",
      email: adminEmail,
      password,
    });

    // ── 2. Navigate to admin invites page ─────────────────────────────
    await page.goto("/admin/invites");
    await expect(page.getByText("Invites")).toBeVisible({ timeout: 10000 });

    // ── 3. Click create invite button ──────────────────────────────
    // Wait for hydration before clicking — the button renders server-side
    // but the onClick handler is only attached after React hydrates.
    await page.waitForTimeout(2000);
    const createInviteButton = page.getByRole("button", {
      name: /create invite link/i,
    });
    await createInviteButton.click();

    // Wait for the dialog or drawer to appear
    const dialogOrDrawer = page.locator("[role=dialog], [data-vaul-drawer]");
    await expect(dialogOrDrawer).toBeVisible({ timeout: 10000 });

    // ── 4. Select "Unlimited" usage mode and create the invite link ──
    await dialogOrDrawer.getByText("Unlimited").click();

    const dialogCreateButton = dialogOrDrawer.getByRole("button", {
      name: /create invite link/i,
    });
    await dialogCreateButton.click();

    // ── 5. Wait for the invite URL to appear in the <code> block ────
    const codeBlock = dialogOrDrawer.locator("code");
    await expect(codeBlock).toBeVisible({ timeout: 10000 });
    const inviteUrl = await codeBlock.textContent();
    expect(inviteUrl).toBeTruthy();
    expect(inviteUrl).toContain("/auth/sign-up?token=");

    // ── 6. Extract the relative path from the invite URL ────────────
    const url = new URL(inviteUrl!.trim());
    const invitePath = `${url.pathname}${url.search}`;

    // ── 7. Sign out the admin ───────────────────────────────────────
    const closeButton = page.locator(
      "[role=dialog] button:has(svg), [data-vaul-drawer] button:has(svg)",
    );
    if (await closeButton.first().isVisible()) {
      await closeButton.first().click();
    }

    await page.goto("/api/auth/sign-out", { waitUntil: "networkidle" });

    // ── 8. First invited user signs up ──────────────────────────────
    await page.goto(invitePath);
    await expect(
      page.getByRole("button", { name: /create an account/i }),
    ).toBeVisible({ timeout: 10000 });

    await page
      .locator("#first-name")
      .pressSequentially("Invited User", { delay: 50 });
    await page.locator("#email").pressSequentially(invitedEmail, { delay: 50 });
    await page.locator("#password").pressSequentially(password, { delay: 50 });
    await page
      .locator("#password_confirmation")
      .pressSequentially(password, { delay: 50 });

    // Capture the sign-up request to verify the invitation token is sent
    const signUpRequestPromise = page.waitForRequest((req) =>
      req.url().includes("/sign-up/email"),
    );
    await page.getByRole("button", { name: /create an account/i }).click();
    const signUpRequest = await signUpRequestPromise;
    const signUpBody = signUpRequest.postDataJSON();
    expect(signUpBody.invitationToken).toBeTruthy();

    await expect(page).toHaveURL("/", { timeout: 30000 });

    // ── 9. Sign out first invited user, sign in as admin ────────────
    await page.goto("/api/auth/sign-out", { waitUntil: "networkidle" });
    await signIn({ page, email: adminEmail, password });

    // ── 10. Verify use count updated to 1, still active ────────────
    await clearQueryCache(page);
    await page.goto("/admin/invites");
    await expect(page.getByText("1 use", { exact: false })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText("Active").first()).toBeVisible();

    // ── 11. Sign out admin ─────────────────────────────────────────
    await page.goto("/api/auth/sign-out", { waitUntil: "networkidle" });

    // ── 12. Second invited user signs up with the same link ─────────
    await page.goto(invitePath);
    await expect(
      page.getByRole("button", { name: /create an account/i }),
    ).toBeVisible({ timeout: 10000 });

    await page
      .locator("#first-name")
      .pressSequentially("Second User", { delay: 50 });
    await page
      .locator("#email")
      .pressSequentially(invitedEmail2, { delay: 50 });
    await page.locator("#password").pressSequentially(password, { delay: 50 });
    await page
      .locator("#password_confirmation")
      .pressSequentially(password, { delay: 50 });

    await page.getByRole("button", { name: /create an account/i }).click();
    await expect(page).toHaveURL("/", { timeout: 30000 });

    // ── 13. Sign out second user, sign in as admin ──────────────────
    await page.goto("/api/auth/sign-out", { waitUntil: "networkidle" });
    await signIn({ page, email: adminEmail, password });

    // ── 14. Verify use count updated to 2, still active ────────────
    await clearQueryCache(page);
    await page.goto("/admin/invites");
    await expect(page.getByText("2 uses")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Active").first()).toBeVisible();
  });

  test("single-use invite link is rejected after one sign-up", async ({
    page,
  }) => {
    test.setTimeout(180000);
    adminEmail = generateTestEmail();
    invitedEmail = generateTestEmail();
    invitedEmail2 = generateTestEmail();
    const password = "testpassword123";

    // ── 1. Seed admin user directly in DB and sign in ─────────────────
    await signUpAsAdmin({
      page,
      tursoPort: SELF_HOSTED_TURSO_PORT,
      name: "Admin User",
      email: adminEmail,
      password,
    });

    // ── 2. Navigate to admin invites page ───────────────────────────
    await page.goto("/admin/invites");
    await expect(page.getByText("Invites")).toBeVisible({ timeout: 10000 });

    // ── 3. Open the create invite dialog ────────────────────────────
    // Wait for hydration before clicking — the button renders server-side
    // but the onClick handler is only attached after React hydrates.
    await page.waitForTimeout(2000);
    const createInviteButton = page.getByRole("button", {
      name: /create invite link/i,
    });
    await createInviteButton.click();

    // Wait for the dialog or drawer to appear
    const dialogOrDrawer = page.locator("[role=dialog], [data-vaul-drawer]");
    await expect(dialogOrDrawer).toBeVisible({ timeout: 10000 });

    // ── 4. "One time" is the default usage mode — create the link ───
    const dialogCreateButton = dialogOrDrawer.getByRole("button", {
      name: /create invite link/i,
    });
    await dialogCreateButton.click();

    // ── 5. Grab the invite URL ──────────────────────────────────────
    const codeBlock2 = dialogOrDrawer.locator("code");
    await expect(codeBlock2).toBeVisible({ timeout: 10000 });
    const inviteUrl2 = await codeBlock2.textContent();
    expect(inviteUrl2).toBeTruthy();
    expect(inviteUrl2).toContain("/auth/sign-up?token=");

    const url2 = new URL(inviteUrl2!.trim());
    const invitePath = `${url2.pathname}${url2.search}`;

    // ── 6. Close dialog, verify initial use count and status ────────
    const closeButton = page.locator(
      "[role=dialog] button:has(svg), [data-vaul-drawer] button:has(svg)",
    );
    if (await closeButton.first().isVisible()) {
      await closeButton.first().click();
    }

    await expect(page.getByText("0 / 1 uses")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Active").first()).toBeVisible();

    // ── 7. Sign out the admin ───────────────────────────────────────
    await page.goto("/api/auth/sign-out", { waitUntil: "networkidle" });

    // ── 8. First user signs up successfully ─────────────────────────
    await page.goto(invitePath);
    await expect(
      page.getByRole("button", { name: /create an account/i }),
    ).toBeVisible({ timeout: 10000 });

    await page
      .locator("#first-name")
      .pressSequentially("Invited User", { delay: 50 });
    await page.locator("#email").pressSequentially(invitedEmail, { delay: 50 });
    await page.locator("#password").pressSequentially(password, { delay: 50 });
    await page
      .locator("#password_confirmation")
      .pressSequentially(password, { delay: 50 });

    await page.getByRole("button", { name: /create an account/i }).click();
    await expect(page).toHaveURL("/", { timeout: 30000 });

    // ── 9. Sign out first user, sign in as admin ────────────────────
    await page.goto("/api/auth/sign-out", { waitUntil: "networkidle" });
    await signIn({ page, email: adminEmail, password });

    // ── 10. Verify use count is 1/1 and status is Exhausted ─────────
    await clearQueryCache(page);
    await page.goto("/admin/invites");
    await expect(page.getByText("1 / 1 uses")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Used")).toBeVisible();

    // ── 11. Sign out admin ──────────────────────────────────────────
    await page.goto("/api/auth/sign-out", { waitUntil: "networkidle" });

    // ── 12. Second user sees disabled sign-up ───────────────────────
    await page.goto(invitePath);
    await expect(
      page.getByText(/sign ups are currently disabled/i),
    ).toBeVisible({ timeout: 10000 });
  });
});
