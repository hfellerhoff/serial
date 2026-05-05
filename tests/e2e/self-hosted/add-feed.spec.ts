import { expect, test } from "@playwright/test";
import {
  SELF_HOSTED_APP_PORT,
  SELF_HOSTED_RSS_SERVER_PORT,
  SELF_HOSTED_TURSO_PORT,
} from "../fixtures/ports";
import { cleanupUser, seedArticleData } from "../fixtures/seed-db";
import { signIn } from "../fixtures/auth";

test.describe("add feed manually", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  let testEmail: string;

  test.afterEach(async () => {
    if (testEmail) {
      await cleanupUser(SELF_HOSTED_TURSO_PORT, testEmail);
    }
  });

  test("add a single feed by URL and verify it appears", async ({ page }) => {
    test.setTimeout(120000);

    const { email, password } = await seedArticleData(
      SELF_HOSTED_TURSO_PORT,
      SELF_HOSTED_APP_PORT,
      SELF_HOSTED_RSS_SERVER_PORT,
    );
    testEmail = email;

    await signIn({ page, email, password });
    await expect(page.locator("article").first()).toBeVisible({
      timeout: 30000,
    });

    // Open the Add Feed dialog with the "a" keyboard shortcut
    await page.keyboard.press("a");
    await page.waitForTimeout(300);

    // Wait for Add Feed dialog
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog.getByRole("heading", { name: "Add Feed" })).toBeVisible(
      { timeout: 5000 },
    );

    // Enter the RSS server URL for the "cgp-grey" feed
    const feedUrl = `http://127.0.0.1:${SELF_HOSTED_RSS_SERVER_PORT}/feed/cgp-grey`;
    await dialog.locator('input[type="url"]').fill(feedUrl);

    // Click the Find button
    await dialog.getByRole("button", { name: /find/i }).click();

    // For a single discovered feed, the dialog auto-selects it (locked state).
    // Wait for the selected feed badge to appear.
    await expect(
      dialog.locator("p").filter({ hasText: "CGP Grey" }),
    ).toBeVisible({ timeout: 10000 });

    // Click Add Feed button
    await dialog.getByRole("button", { name: /add .* feed/i }).click();

    // Verify success toast
    await expect(page.getByText("Feed added!")).toBeVisible({
      timeout: 10000,
    });

    // Verify the feed appears in the sidebar
    const feedsSection = page.locator('[data-sidebar="group"]').filter({
      has: page.locator('[data-sidebar="group-label"]', { hasText: "Feeds" }),
    });
    await expect(
      feedsSection.getByRole("button", { name: "CGP Grey" }),
    ).toBeVisible({ timeout: 10000 });

    // Verify the feed appears on /feeds
    await page.goto("/feeds");
    await expect(
      page.getByRole("tab", { name: /feeds/i, selected: true }),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator("main").getByRole("button", { name: "CGP Grey" }),
    ).toBeVisible({ timeout: 10000 });
  });
});
