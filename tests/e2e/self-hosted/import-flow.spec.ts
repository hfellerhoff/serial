import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { SELF_HOSTED_TURSO_PORT } from "../fixtures/ports";
import {
  cleanupUser,
  generateTestEmail,
  verifyUserCleanup,
} from "../fixtures/seed-db";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OPML_PATH = path.join(__dirname, "../fixtures/subscriptions.opml");

test.describe("full user lifecycle", () => {
  // Wide viewport so both sidebars are visible without toggling
  // test.use({ viewport: { width: 1920, height: 1080 } });

  let testEmail: string;

  test.afterEach(async () => {
    // Safety-net cleanup in case test fails before account deletion
    if (testEmail) {
      await cleanupUser(SELF_HOSTED_TURSO_PORT, testEmail);
    }
  });

  test("sign up, import, categorize, read, customize, delete feeds, delete account, verify db clean", async ({
    page,
  }) => {
    test.setTimeout(120000);
    testEmail = generateTestEmail();

    // ── 1. Sign Up ──────────────────────────────────────────────────
    await page.goto("/");
    await expect(page).toHaveURL(/auth\/sign-in/);
    await page.goto("/auth/sign-up");
    await expect(page.locator("#first-name")).toBeVisible({ timeout: 10000 });

    await page
      .locator("#first-name")
      .pressSequentially("Test User", { delay: 50 });
    await page.locator("#email").pressSequentially(testEmail, { delay: 50 });
    await page
      .locator("#password")
      .pressSequentially("testpassword123", { delay: 50 });
    await page
      .locator("#password_confirmation")
      .pressSequentially("testpassword123", { delay: 50 });

    await page.getByRole("button", { name: /create an account/i }).click();
    await expect(page).toHaveURL("/", { timeout: 30000 });

    // ── 2. Import Feeds ─────────────────────────────────────────────
    await page.goto("/import");
    await expect(page.getByText("Import Feeds")).toBeVisible();

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

    await page.getByRole("link", { name: /back to home/i }).click();
    await expect(page).toHaveURL("/");

    // Open right sidebar to verify feeds
    await page.keyboard.press("Backslash");
    const feedsSection = page.locator('[data-sidebar="group"]').filter({
      has: page.locator('[data-sidebar="group-label"]', { hasText: "Feeds" }),
    });

    await expect(
      feedsSection.getByRole("button", { name: "Scary Pockets" }),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      feedsSection.getByRole("button", { name: "Fireship" }),
    ).toBeVisible();
    await expect(
      feedsSection.getByRole("button", { name: "CGP Grey" }),
    ).toBeVisible();
    await expect(
      feedsSection.getByRole("button", { name: "Test Blog" }),
    ).toBeVisible();

    // Click a feed and verify its articles load
    await feedsSection.getByRole("button", { name: "Scary Pockets" }).click();
    await expect(
      page
        .locator("article h3")
        .filter({ hasText: "Funky Test Video" })
        .first(),
    ).toBeVisible({ timeout: 10000 });

    // ── 3. Create Content Categories ────────────────────────────────
    // Close right sidebar so the left sidebar categories are accessible

    const categoriesSection = page.locator('[data-sidebar="group"]').filter({
      has: page.locator('[data-sidebar="group-label"]', {
        hasText: "Categories",
      }),
    });

    // Create "Music" category
    await categoriesSection
      .locator('[data-sidebar="group-label"]')
      .getByRole("button")
      .click();
    await expect(
      page.getByRole("heading", { name: "Add Category" }),
    ).toBeVisible();
    await page.locator("#name").fill("Music");
    await page
      .locator('[role="dialog"]')
      .getByRole("button", { name: "Add Category" })
      .click();

    // Wait for dialog to close and category to appear
    await expect(categoriesSection.getByText("Music")).toBeVisible({
      timeout: 10000,
    });

    // Create "Tech" category
    await categoriesSection
      .locator('[data-sidebar="group-label"]')
      .getByRole("button")
      .click();
    await expect(
      page.getByRole("heading", { name: "Add Category" }),
    ).toBeVisible();
    await page.locator("#name").fill("Tech");
    await page
      .locator('[role="dialog"]')
      .getByRole("button", { name: "Add Category" })
      .click();

    await expect(categoriesSection.getByText("Tech")).toBeVisible({
      timeout: 10000,
    });

    // ── 4. Assign Categories to Feeds ───────────────────────────────
    await page.goto("/feeds");
    await expect(page.getByText("Manage Feeds")).toBeVisible({
      timeout: 10000,
    });

    // Scope feed rows to the main content area (exclude sidebars)
    const mainContent = page.locator("main");

    // Select Scary Pockets and assign "Music"
    await mainContent.getByRole("button", { name: /Scary Pockets/ }).click();

    await page.getByRole("button", { name: /edit categories/i }).click();
    await expect(
      page.getByRole("heading", { name: "Edit Categories" }),
    ).toBeVisible();

    // Toggle the "Music" category in the dialog
    await page.locator('[role="dialog"]').getByText("Music").click();
    await page
      .locator('[role="dialog"]')
      .getByRole("button", { name: "Save" })
      .click();

    // Wait for save to complete
    await page.waitForTimeout(1000);

    // Verify badge appears on Scary Pockets row
    await expect(
      mainContent
        .getByRole("button", { name: /Scary Pockets/ })
        .getByText("Music"),
    ).toBeVisible({ timeout: 10000 });

    // Deselect, then select Fireship and assign "Tech"
    await mainContent.getByRole("button", { name: /Scary Pockets/ }).click(); // deselect
    await mainContent.getByRole("button", { name: /Fireship/ }).click();

    await page.getByRole("button", { name: /edit categories/i }).click();
    await expect(
      page.getByRole("heading", { name: "Edit Categories" }),
    ).toBeVisible();

    await page.locator('[role="dialog"]').getByText("Tech").click();
    await page
      .locator('[role="dialog"]')
      .getByRole("button", { name: "Save" })
      .click();

    await page.waitForTimeout(1000);

    await expect(
      mainContent.getByRole("button", { name: /Fireship/ }).getByText("Tech"),
    ).toBeVisible({ timeout: 10000 });

    // ── 5. Open and Read an Article ─────────────────────────────────
    await page.goto("/");

    // Wait for articles to appear, then click the first one
    const firstArticle = page.locator("article").first();
    await expect(firstArticle).toBeVisible({ timeout: 15000 });

    await firstArticle.click();

    // Verify article page loaded
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 10000 });

    // Scroll to generate progress
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(50);
    }

    // Wait for debounced progress save
    await page.waitForTimeout(800);

    // Navigate back home
    await page.goto("/");
    await expect(page.locator("article").first()).toBeVisible({
      timeout: 15000,
    });

    // ── 6. Update Appearance Settings ───────────────────────────────
    // Open left sidebar so Appearance is reachable
    await page.keyboard.press("Backslash");
    await page.waitForTimeout(500);

    // Click Appearance in the left sidebar bottom nav
    const appearanceButton = page
      .locator('[data-sidebar="menu-button"]')
      .filter({ hasText: "Appearance" });
    await expect(appearanceButton).toBeVisible({ timeout: 5000 });
    await appearanceButton.click();

    // Switch to Articles tab
    await page.getByRole("tab", { name: "Articles" }).click();

    // Click Serif font family toggle
    await page.getByRole("radio", { name: "Serif", exact: true }).click();

    // Increase font size (click the + button next to font size)
    const fontSizeSection = page.locator("text=Font Size").locator("..");
    const increaseFontButton = fontSizeSection.locator("button").last();
    await increaseFontButton.click();

    // Verify font size changed (default 18 -> 19)
    await expect(fontSizeSection.getByText("19")).toBeVisible();

    // Close the appearance popover
    await page.keyboard.press("Escape");

    // Wait for debounced save
    await page.waitForTimeout(800);

    // ── 7. Bulk Delete All Feeds ────────────────────────────────────
    await page.goto("/feeds");
    await expect(page.getByText("Manage Feeds")).toBeVisible({
      timeout: 10000,
    });

    // Wait for feed rows to appear, then select all
    await expect(
      page.locator("main").getByRole("button", { name: /Scary Pockets/ }),
    ).toBeVisible({ timeout: 10000 });

    // Use keyboard shortcut to select all (avoids selector ambiguity)
    await page.keyboard.press("s");

    // Use keyboard shortcut to delete
    await page.keyboard.press("d");

    // Confirm deletion in the dialog
    const deleteDialog = page.locator('[role="dialog"]');
    await expect(
      deleteDialog.getByRole("heading", { name: "Delete Feeds" }),
    ).toBeVisible();
    await deleteDialog.getByRole("button", { name: /^delete$/i }).click();

    // Wait for deletion to complete - should show empty state or no feed rows
    await page.waitForTimeout(2000);

    // ── 8. Delete User Account ──────────────────────────────────────
    // Navigate to the feeds management page which has visible UI controls
    await page.goto("/feeds");
    await page.waitForTimeout(1000);

    // The add-feed button ('+') is always visible in the header — use it to
    // verify the page loaded, then navigate to the profile via the sidebar.
    // Open the left sidebar so the user menu becomes accessible.
    await page.keyboard.press("Backslash");

    // Wait for sidebar animation to complete
    const userMenuButton = page.locator(
      '[data-sidebar="menu-button"][data-size="lg"]',
    );
    await expect(userMenuButton).toBeAttached({ timeout: 5000 });
    // Scroll the sidebar footer into view and click
    await userMenuButton.scrollIntoViewIfNeeded();
    await userMenuButton.click({ timeout: 10000 });

    // Wait for dropdown to open, then click Edit Profile
    // The button is inside a DropdownMenu — try both menuitem and button roles
    const editProfileButton = page.getByText("Edit Profile", { exact: true });
    await expect(editProfileButton).toBeVisible({ timeout: 5000 });
    await editProfileButton.click();
    await expect(
      page.getByRole("heading", { name: "Edit Profile" }),
    ).toBeVisible({ timeout: 5000 });

    // Click initial Delete Account button
    await page
      .locator('[role="dialog"]')
      .getByRole("button", { name: /delete account/i })
      .click();

    // Type confirmation
    await page
      .locator('input[name="delete-account-confirmation-input"]')
      .fill("DELETE MY ACCOUNT");

    // Click the submit Delete Account button
    await page
      .locator('[role="dialog"]')
      .getByRole("button", { name: /delete account/i })
      .last()
      .click();

    // Verify redirect away from app
    await expect(page).toHaveURL(/welcome|auth/, { timeout: 30000 });

    // ── 9. Verify Database is Clean ─────────────────────────────────
    await verifyUserCleanup(SELF_HOSTED_TURSO_PORT, testEmail);

    // Clear testEmail so afterEach doesn't try cleanup on an already-deleted user
    testEmail = "";
  });
});
