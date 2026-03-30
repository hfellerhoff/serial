import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { SELF_HOSTED_TURSO_PORT } from "../fixtures/ports";
import { cleanupUser, generateTestEmail } from "../fixtures/seed-db";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OPML_PATH = path.join(__dirname, "../fixtures/subscriptions.opml");

test.describe("import flow", () => {
  let testEmail: string;

  test.afterEach(async () => {
    if (testEmail) {
      await cleanupUser(SELF_HOSTED_TURSO_PORT, testEmail);
    }
  });

  test("completes full import workflow", async ({ page }) => {
    testEmail = generateTestEmail();

    await page.goto("/");

    await expect(page).toHaveURL(/auth\/sign-in/);

    await page.goto("/auth/sign-up");

    await expect(page).toHaveURL(/auth\/sign-up/);

    await expect(page.locator("#first-name")).toBeVisible({ timeout: 10000 });

    await page.locator("#first-name").click();
    await page
      .locator("#first-name")
      .pressSequentially("Test User", { delay: 50 });
    await expect(page.locator("#first-name")).toHaveValue("Test User");
    await page.locator("#email").click();
    await page.locator("#email").pressSequentially(testEmail, { delay: 50 });
    await expect(page.locator("#email")).toHaveValue(testEmail);
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

    await page.goto("/import");
    await expect(page.getByText("Import Feeds")).toBeVisible();

    // Wait for hydration — the dropzone button must be interactive
    const dropzone = page.getByText(/drag and drop/i);
    await expect(dropzone).toBeVisible();
    await page.waitForTimeout(1000);

    const fileChooserPromise = page.waitForEvent("filechooser");
    await dropzone.click();
    const fileChooser = await fileChooserPromise;
    const opmlContent = fs.readFileSync(OPML_PATH);
    await fileChooser.setFiles({
      name: "subscriptions.opml",
      mimeType: "application/xml",
      buffer: opmlContent,
    });

    await expect(page.getByText("Feeds To Import")).toBeVisible({
      timeout: 10000,
    });

    const importButton = page.getByRole("button", {
      name: /import \d+ feeds/i,
    });
    await expect(importButton).toBeEnabled({ timeout: 10000 });
    await importButton.click();

    await expect(page.getByText("Import finished")).toBeVisible({
      timeout: 60000,
    });

    await page.getByRole("link", { name: /back to feeds/i }).click();
    await expect(page).toHaveURL("/");

    // Open the feeds sidebar (Shift+| keyboard shortcut toggles right sidebar)
    await page.keyboard.press("Shift+Backslash");

    // Scope to the "Feeds" group in the right sidebar pane
    const feedsSection = page.locator('[data-sidebar="group"]').filter({
      has: page.locator('[data-sidebar="group-label"]', { hasText: "Feeds" }),
    });

    await expect(
      feedsSection.getByRole("button", { name: "Scary Pockets" }),
    ).toBeVisible({
      timeout: 10000,
    });
    await expect(
      feedsSection.getByRole("button", { name: "Fireship" }),
    ).toBeVisible();
    await expect(
      feedsSection.getByRole("button", { name: "CGP Grey" }),
    ).toBeVisible();

    // Click each feed in the sidebar and verify its items appear in the main view
    await feedsSection.getByRole("button", { name: "Scary Pockets" }).click();
    await expect(
      page
        .locator("article h3")
        .filter({ hasText: "Funky Test Video" })
        .first(),
    ).toBeVisible({ timeout: 10000 });

    await feedsSection.getByRole("button", { name: "Fireship" }).click();
    await expect(
      page
        .locator("article h3")
        .filter({ hasText: "100 Seconds of Code" })
        .first(),
    ).toBeVisible({ timeout: 10000 });

    await feedsSection.getByRole("button", { name: "CGP Grey" }).click();
    await expect(
      page
        .locator("article h3")
        .filter({ hasText: "Rules for Rulers" })
        .first(),
    ).toBeVisible({ timeout: 10000 });
  });
});
