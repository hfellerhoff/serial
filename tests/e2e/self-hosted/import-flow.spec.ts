import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { signUp } from "../fixtures/auth";
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
    test.setTimeout(180000);
    testEmail = generateTestEmail();

    // ── 1. Sign Up ──────────────────────────────────────────────────
    await signUp({
      page,
      name: "Test User",
      email: testEmail,
      password: "testpassword123",
    });

    // ── 2. Import Feeds ─────────────────────────────────────────────
    await page.goto("/import");
    await expect(page.getByText("Import Feeds")).toBeVisible();

    const dropzone = page.getByText(/drag and drop/i);
    await expect(dropzone).toBeVisible();
    await page.locator('input[data-ready="true"]').waitFor({ timeout: 10000 });

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

    // ── 3. Create Tags ──────────────────────────────────────────────
    // (Tags are stored as content categories internally; UI says "Tags".)

    const tagsSection = page.locator('[data-sidebar="group"]').filter({
      has: page.locator('[data-sidebar="group-label"]', {
        hasText: "Tags",
      }),
    });

    // Create "Music" tag
    await tagsSection
      .locator('[data-sidebar="group-label"]')
      .getByRole("button")
      .click();
    await expect(page.getByRole("heading", { name: "Add Tag" })).toBeVisible();
    await page.locator("#name").fill("Music");
    await page
      .locator('[role="dialog"]')
      .getByRole("button", { name: "Add Tag" })
      .click();

    // Wait for dialog to close and tag to appear
    await expect(tagsSection.getByText("Music")).toBeVisible({
      timeout: 10000,
    });

    // Create "Tech" tag
    await tagsSection
      .locator('[data-sidebar="group-label"]')
      .getByRole("button")
      .click();
    await expect(page.getByRole("heading", { name: "Add Tag" })).toBeVisible();
    await page.locator("#name").fill("Tech");
    await page
      .locator('[role="dialog"]')
      .getByRole("button", { name: "Add Tag" })
      .click();

    await expect(tagsSection.getByText("Tech")).toBeVisible({
      timeout: 10000,
    });

    // ── 4. Assign Categories to Feeds ───────────────────────────────
    await page.goto("/feeds");
    await expect(
      page.getByRole("tab", { name: /feeds/i, selected: true }),
    ).toBeVisible({
      timeout: 10000,
    });

    // Scope feed rows to the main content area (exclude sidebars)
    const mainContent = page.locator("main");

    // Select Scary Pockets and assign "Music"
    await mainContent.getByRole("button", { name: /Scary Pockets/ }).click();

    const editButton = page.getByRole("button", { name: /\bedit\b/i });
    await expect(editButton).toBeVisible({ timeout: 10000 });
    await editButton.click();
    await expect(
      page.getByRole("heading", { name: "Edit Feeds" }),
    ).toBeVisible();

    // Open the tags combobox and select "Music"
    const editCatDialog = page.locator('[role="dialog"]');
    // Click the "+" button next to "Tags" label to open combobox
    await editCatDialog
      .getByText("Tags", { exact: true })
      .locator("..")
      .locator("button")
      .click();
    await page.waitForTimeout(500);
    // Use keyboard to search and select
    await page.keyboard.type("Music", { delay: 30 });
    await page.waitForTimeout(300);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    // Close combobox by pressing Escape twice (once for combobox, once if needed)
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    await editCatDialog.getByRole("button", { name: "Save" }).click();

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

    await page.getByRole("button", { name: /\bedit\b/i }).click();
    await expect(
      page.getByRole("heading", { name: "Edit Feeds" }),
    ).toBeVisible();

    // Open the tags combobox and select "Tech"
    const editCatDialog2 = page.locator('[role="dialog"]');
    await editCatDialog2
      .getByText("Tags", { exact: true })
      .locator("..")
      .locator("button")
      .click();
    await page.waitForTimeout(500);
    await page.keyboard.type("Tech", { delay: 30 });
    await page.waitForTimeout(300);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    await editCatDialog2.getByRole("button", { name: "Save" }).click();

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

    // ── 6.5 Export Data via Settings → Export Data sub-pane ─────────
    // Open Settings dialog from the user menu in the left sidebar
    {
      const userMenuButton = page.locator(
        '[data-sidebar="menu-button"][data-size="lg"]',
      );
      await expect(userMenuButton).toBeAttached({ timeout: 5000 });
      await userMenuButton.scrollIntoViewIfNeeded();
      await userMenuButton.click({ timeout: 10000 });

      const settingsButton = page.getByText("Settings", { exact: true });
      await expect(settingsButton).toBeVisible({ timeout: 5000 });
      await settingsButton.click();

      const settingsDialog = page.locator('[role="dialog"]');
      await expect(
        settingsDialog.getByRole("heading", { name: "Settings" }),
      ).toBeVisible({ timeout: 5000 });

      // Navigate into the Export Data sub-pane
      await settingsDialog
        .getByRole("button", { name: /export data/i })
        .click();
      await expect(
        settingsDialog.getByRole("heading", { name: "Export Data" }),
      ).toBeVisible({ timeout: 5000 });

      // Default grouping is "Group by View" — switch to "Group by Tag"
      await settingsDialog.getByText("Group by Tag").click();

      // Wait for the download triggered by the Export OPML button
      const downloadPromise = page.waitForEvent("download");
      await settingsDialog
        .getByRole("button", { name: /export opml/i })
        .click();
      const download = await downloadPromise;

      // Read the downloaded file
      const downloadPath = await download.path();
      expect(downloadPath).toBeTruthy();
      const tagOpmlContent = fs.readFileSync(downloadPath, "utf-8");

      // Validate basic OPML structure
      expect(tagOpmlContent).toContain('<?xml version="1.0"');
      expect(tagOpmlContent).toContain('<opml version="2.0">');
      expect(tagOpmlContent).toContain("<head><title>Serial Export</title>");
      expect(tagOpmlContent).toContain("</opml>");

      // Validate tag groups: Music contains Scary Pockets; Tech contains Fireship
      const musicGroupMatch = tagOpmlContent.match(
        /<outline title="Music"[^>]*>([\s\S]*?)<\/outline>/,
      );
      expect(musicGroupMatch).toBeTruthy();
      expect(musicGroupMatch?.[1]).toMatch(/Scary Pockets/i);

      const techGroupMatch = tagOpmlContent.match(
        /<outline title="Tech"[^>]*>([\s\S]*?)<\/outline>/,
      );
      expect(techGroupMatch).toBeTruthy();
      expect(techGroupMatch?.[1]).toMatch(/Fireship/i);

      // Validate ungrouped (at root level under <body>) for feeds with no tag.
      // The OPML test fixture has bare feeds (no real sections), and only
      // Scary Pockets and Fireship are manually tagged in this test, so the
      // remaining feeds (CGP Grey, Test Blog) should appear at root level.
      const bodyMatch = tagOpmlContent.match(/<body>([\s\S]*?)<\/body>/);
      expect(bodyMatch).toBeTruthy();
      const bodyContent = bodyMatch?.[1] ?? "";
      const rootLevelFeedLines = bodyContent
        .split("\n")
        .filter((line) => /^\s{4}<outline type="rss"/.test(line));
      expect(rootLevelFeedLines.length).toBeGreaterThan(0);

      // Now switch to Group by View and re-export to verify view mode works
      await settingsDialog.getByText("Group by View").click();

      const viewDownloadPromise = page.waitForEvent("download");
      await settingsDialog
        .getByRole("button", { name: /export opml/i })
        .click();
      const viewDownload = await viewDownloadPromise;
      const viewDownloadPath = await viewDownload.path();
      expect(viewDownloadPath).toBeTruthy();
      const viewOpmlContent = fs.readFileSync(viewDownloadPath, "utf-8");

      // No custom views were created in this test, so all feeds should be
      // at the root level (no group <outline> wrappers).
      expect(viewOpmlContent).toContain('<opml version="2.0">');
      const viewBodyMatch = viewOpmlContent.match(/<body>([\s\S]*?)<\/body>/);
      expect(viewBodyMatch).toBeTruthy();
      const viewBodyContent = viewBodyMatch?.[1] ?? "";
      // Should NOT contain any nested outline groups since no custom views exist
      expect(viewBodyContent).not.toMatch(/<outline title="[^"]+">/);
      // But should still have feed entries at the root
      expect(viewBodyContent).toMatch(/<outline type="rss"/);

      // Go back to main settings, then close the dialog
      await settingsDialog.getByRole("button", { name: /^back$/i }).click();
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }

    // ── 7. Bulk Delete All Feeds ────────────────────────────────────
    await page.goto("/feeds");
    await expect(
      page.getByRole("tab", { name: /feeds/i, selected: true }),
    ).toBeVisible({
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

    // Wait for the dialog to close
    await expect(
      deleteDialog.getByRole("heading", { name: "Delete Feeds" }),
    ).toBeHidden({ timeout: 10000 });

    // Verify all feed rows are gone from the main feeds list
    await expect(
      mainContent.getByRole("button", { name: /Scary Pockets/ }),
    ).toHaveCount(0, { timeout: 10000 });
    await expect(
      mainContent.getByRole("button", { name: /Fireship/ }),
    ).toHaveCount(0);
    await expect(
      mainContent.getByRole("button", { name: /CGP Grey/ }),
    ).toHaveCount(0);
    await expect(
      mainContent.getByRole("button", { name: /Test Blog/ }),
    ).toHaveCount(0);

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

    // Wait for dropdown to open, then click Settings
    const settingsButton = page.getByText("Settings", { exact: true });
    await expect(settingsButton).toBeVisible({ timeout: 5000 });
    await settingsButton.click();
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible({
      timeout: 5000,
    });

    // Navigate into the Delete Account sub-pane
    const finalSettingsDialog = page.locator('[role="dialog"]');
    await finalSettingsDialog
      .getByRole("button", { name: /delete account/i })
      .click();
    await expect(
      finalSettingsDialog.getByRole("heading", { name: "Delete Account" }),
    ).toBeVisible({ timeout: 5000 });

    // Click initial Delete Account button (inside sub-pane)
    await finalSettingsDialog
      .getByRole("button", { name: /delete account/i })
      .click();

    // Type confirmation
    await page
      .locator('input[name="delete-account-confirmation-input"]')
      .fill("DELETE MY ACCOUNT");

    // Click the submit Delete Account button
    await finalSettingsDialog
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
