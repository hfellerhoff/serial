import { expect, test } from "@playwright/test";
import { signUp } from "../fixtures/auth";
import {
  SELF_HOSTED_RSS_SERVER_PORT,
  SELF_HOSTED_TURSO_PORT,
} from "../fixtures/ports";
import { cleanupUser, generateTestEmail } from "../fixtures/seed-db";

const TOTAL_FEEDS = 110;

function generateOpml(count: number): Buffer {
  const outlines = Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    return `    <outline text="Test Feed ${n}" title="Test Feed ${n}" type="rss" xmlUrl="http://127.0.0.1:${SELF_HOSTED_RSS_SERVER_PORT}/feed/test-feed-${n}" htmlUrl="http://127.0.0.1:${SELF_HOSTED_RSS_SERVER_PORT}/test-feed-${n}"/>`;
  }).join("\n");
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<opml version="1.1">
  <head><title>Test Subscriptions (${count})</title></head>
  <body>
${outlines}
  </body>
</opml>`);
}

test.describe("feed limit on self-hosted (no limit)", () => {
  let testEmail: string;

  test.afterEach(async () => {
    if (testEmail) {
      await cleanupUser(SELF_HOSTED_TURSO_PORT, testEmail);
    }
  });

  test("importing 110 feeds has no limit on self-hosted instance", async ({
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

    // Verify NO "added as inactive" toast appeared
    await expect(
      page.getByText(/feeds? (?:were|was) added as inactive/i),
    ).not.toBeVisible();

    // Navigate to /feeds and verify all feeds are active (no opacity-50 rows)
    await page.goto("/feeds");

    // Wait for feeds to load — at least one feed row should be visible
    await expect(
      page.locator("button").filter({ hasText: "Test Feed" }).first(),
    ).toBeVisible({ timeout: 15000 });

    // No inactive feed rows
    const inactiveFeedRows = page.locator("button.opacity-50");
    await expect(inactiveFeedRows).toHaveCount(0, { timeout: 10000 });
  });
});
