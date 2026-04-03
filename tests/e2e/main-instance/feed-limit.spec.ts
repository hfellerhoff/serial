import { expect, test } from "@playwright/test";
import { MAIN_RSS_SERVER_PORT, MAIN_TURSO_PORT } from "../fixtures/ports";
import { cleanupUser, generateTestEmail } from "../fixtures/seed-db";

const TOTAL_FEEDS = 110;
const MAX_ACTIVE = 100;
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

  test.afterEach(async () => {
    if (testEmail) {
      await cleanupUser(MAIN_TURSO_PORT, testEmail);
    }
  });

  test("importing 110 feeds limits active to 100 and shows upgrade CTA", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    testEmail = generateTestEmail();

    // Sign up
    await page.goto("/auth/sign-up");
    await expect(page.locator("#first-name")).toBeVisible({ timeout: 10000 });
    await page.locator("#first-name").click();
    await page
      .locator("#first-name")
      .pressSequentially("Test User", { delay: 50 });
    await page.locator("#email").click();
    await page.locator("#email").pressSequentially(testEmail, { delay: 50 });
    await page.locator("#password").click();
    await page
      .locator("#password")
      .pressSequentially("testpassword123", { delay: 50 });
    await page.locator("#password_confirmation").click();
    await page
      .locator("#password_confirmation")
      .pressSequentially("testpassword123", { delay: 50 });
    await page.getByRole("button", { name: /create an account/i }).click();
    await expect(page).toHaveURL("/", { timeout: 30000 });

    // Navigate to import
    await page.goto("/import");
    await expect(page.getByText("Import Feeds")).toBeVisible();

    const dropzone = page.getByText(/drag and drop/i);
    await expect(dropzone).toBeVisible();
    await page.waitForTimeout(1000);

    // Upload the 110-feed OPML
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
    await expect(
      page.getByText("Choose a plan that fits your needs."),
    ).toBeVisible({ timeout: 5000 });
    await page.keyboard.press("Escape");

    // Navigate to /feeds and verify the counter
    await page.goto("/feeds");
    await expect(
      page.getByText(`${MAX_ACTIVE} / ${MAX_ACTIVE} feeds active`),
    ).toBeVisible({ timeout: 15000 });

    // Verify "Max active feeds reached" alert
    await expect(page.getByText("Max active feeds reached")).toBeVisible();

    // Click "Upgrade your plan" button and verify subscription dialog opens
    await page.getByRole("button", { name: /upgrade your plan/i }).click();
    await expect(
      page.getByText("Choose a plan that fits your needs."),
    ).toBeVisible({ timeout: 5000 });
    await page.keyboard.press("Escape");

    // Verify exactly 10 inactive feed rows (opacity-50 class)
    const inactiveFeedRows = page.locator("button.opacity-50");
    await expect(inactiveFeedRows).toHaveCount(EXPECTED_INACTIVE, {
      timeout: 10000,
    });
  });
});
