import { expect, test } from "@playwright/test";
import { seedAdmin, signUp } from "../fixtures/auth";
import { MAIN_RSS_SERVER_PORT, MAIN_TURSO_PORT } from "../fixtures/ports";
import { cleanupUser, generateTestEmail } from "../fixtures/seed-db";

const TOTAL_FEEDS = 50;
const MAX_ACTIVE = 40;
const EXPECTED_INACTIVE = TOTAL_FEEDS - MAX_ACTIVE;

function generateOpml(count: number): Buffer {
  const outlines = Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    return `    <outline text="Test Feed ${n}" title="Test Feed ${n}" type="rss" xmlUrl="http://127.0.0.1:${MAIN_RSS_SERVER_PORT}/feed/test-feed-${n}" htmlUrl="http://127.0.0.1:${MAIN_RSS_SERVER_PORT}/test-feed-${n}"/>`;
  }).join("\n");
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<opml version="1.1">
  <head><title>Test Subscriptions (${count})</title></head>
  <body>
${outlines}
  </body>
</opml>`);
}

test.describe("feed limit for free plan", () => {
  let testEmail: string;
  const adminEmail = "admin-feed-limit@example.com";

  // Seed an admin user first so the test user is a non-admin (second user).
  // The first user to sign up is automatically promoted to admin, which
  // gets unlimited feeds — bypassing the limit this test needs to verify.
  test.beforeEach(async () => {
    await seedAdmin({
      tursoPort: MAIN_TURSO_PORT,
      name: "Admin User",
      email: adminEmail,
      password: "adminpassword123",
    });
  });

  test.afterEach(async () => {
    if (testEmail) {
      await cleanupUser(MAIN_TURSO_PORT, testEmail);
    }
    await cleanupUser(MAIN_TURSO_PORT, adminEmail);
  });

  test("importing 50 feeds limits active to 40 and shows upgrade CTA", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    testEmail = generateTestEmail();

    // Sign up
    await signUp({
      page,
      name: "Test User",
      email: testEmail,
      password: "testpassword123",
    });

    // Navigate to import
    await page.goto("/import");
    await expect(page.getByText("Import Feeds")).toBeVisible();

    const dropzone = page.getByText(/drag and drop/i);
    await expect(dropzone).toBeVisible();
    await page.locator('input[data-ready="true"]').waitFor({ timeout: 10000 });

    const fileChooserPromise = page.waitForEvent("filechooser");
    await dropzone.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: "subscriptions.opml",
      mimeType: "application/xml",
      buffer: generateOpml(TOTAL_FEEDS),
    });

    await expect(page.getByText("Feeds To Import")).toBeVisible({
      timeout: 10000,
    });

    const importButton = page.getByRole("button", {
      name: /import \d+ feeds/i,
    });
    await expect(importButton).toBeEnabled({ timeout: 10000 });
    await importButton.click();

    // Wait for import to finish
    await expect(page.getByText("Import finished")).toBeVisible({
      timeout: 120_000,
    });

    // Verify the import-limit-warning toast appears post-import
    await expect(
      page.getByText(/\d+ feeds? (?:were|was) added as inactive/i),
    ).toBeVisible({ timeout: 10_000 });

    // Click "Upgrade" in the toast to open subscription dialog
    await page.getByRole("button", { name: "Upgrade" }).click();
    await expect(page.getByText("All prices are taxes-included.")).toBeVisible({
      timeout: 5000,
    });
    await page.keyboard.press("Escape");

    // Navigate to /feeds and verify the "max reached" alert (quota bar is hidden at the limit)
    await page.goto("/feeds");
    await expect(page.getByText("Max active feeds reached")).toBeVisible({
      timeout: 15000,
    });

    // Click "Upgrade your plan" button and verify subscription dialog opens
    await page.getByRole("button", { name: /upgrade your plan/i }).click();
    await expect(page.getByText("All prices are taxes-included.")).toBeVisible({
      timeout: 5000,
    });
    await page.keyboard.press("Escape");

    // Verify exactly 10 inactive feed rows (opacity-50 class)
    const inactiveFeedRows = page.locator("button.opacity-50");
    await expect(inactiveFeedRows).toHaveCount(EXPECTED_INACTIVE, {
      timeout: 10000,
    });
  });
});
