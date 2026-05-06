import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { DEMO_RSS_SERVER_PORT, DEMO_TURSO_PORT } from "../fixtures/ports";
import { resetDb } from "../fixtures/reset-db";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OPML_PATH = path.join(__dirname, "../fixtures/subscriptions.opml");

function getDemoOpmlContent() {
  const raw = fs.readFileSync(OPML_PATH, "utf-8");
  // Replace the self-hosted RSS port (3003) with the demo RSS port (3006)
  return raw.replace(/:3003\//g, `:${DEMO_RSS_SERVER_PORT}/`);
}

test.describe("demo instance full import flow", () => {
  test.beforeAll(async () => {
    await resetDb(DEMO_TURSO_PORT);
  });

  test("auto-provisions, imports, categorizes, reads, exports, and deletes feeds", async ({
    page,
  }) => {
    test.setTimeout(180000);

    // ── 1. Auto-provision on landing ────────────────────────────────
    await page.goto("/");

    // Should redirect to / after auto-provisioning
    await expect(page).toHaveURL("/", { timeout: 30000 });

    // Demo banner should be visible
    await expect(page.getByText(/This is a demo instance/i)).toBeVisible({
      timeout: 10000,
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
    const opmlContent = Buffer.from(getDemoOpmlContent());
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

    // Give the client a moment to hydrate and load initial data
    await page.waitForTimeout(2000);

    // Open right sidebar to verify feeds
    await page.keyboard.press("Backslash");
    await page.waitForTimeout(500);

    const feedsSection = page.locator('[data-sidebar="group"]').filter({
      has: page.locator('[data-sidebar="group-label"]', { hasText: "Feeds" }),
    });

    await expect(
      feedsSection.getByRole("button", { name: "Scary Pockets" }),
    ).toBeVisible({ timeout: 15000 });
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
    ).toBeVisible({ timeout: 15000 });

    // ── 3. Create Tags ──────────────────────────────────────────────
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

    const mainContent = page.locator("main");

    // Select Scary Pockets and assign "Music"
    await mainContent.getByRole("button", { name: /Scary Pockets/ }).click();

    const editButton = page.getByRole("button", { name: /\bedit\b/i });
    await expect(editButton).toBeVisible({ timeout: 10000 });
    await editButton.click();
    await expect(
      page.getByRole("heading", { name: "Edit Feeds" }),
    ).toBeVisible();

    const editCatDialog = page.locator('[role="dialog"]');
    await editCatDialog
      .getByText("Tags", { exact: true })
      .locator("..")
      .locator("button")
      .click();
    await page.waitForTimeout(500);
    await page.keyboard.type("Music", { delay: 30 });
    await page.waitForTimeout(300);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    await editCatDialog.getByRole("button", { name: "Save" }).click();

    await page.waitForTimeout(1000);

    await expect(
      mainContent
        .getByRole("button", { name: /Scary Pockets/ })
        .getByText("Music"),
    ).toBeVisible({ timeout: 10000 });

    // Deselect, then select Fireship and assign "Tech"
    await mainContent.getByRole("button", { name: /Scary Pockets/ }).click();
    await mainContent.getByRole("button", { name: /Fireship/ }).click();

    await page.getByRole("button", { name: /\bedit\b/i }).click();
    await expect(
      page.getByRole("heading", { name: "Edit Feeds" }),
    ).toBeVisible();

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

    const firstArticle = page.locator("article").first();
    await expect(firstArticle).toBeVisible({ timeout: 15000 });

    await firstArticle.click();

    await expect(page.locator("h1").first()).toBeVisible({ timeout: 10000 });

    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(50);
    }

    await page.waitForTimeout(800);

    await page.goto("/");
    await expect(page.locator("article").first()).toBeVisible({
      timeout: 15000,
    });

    // ── 6. Update Appearance Settings ─────────────────────────────────
    await page.keyboard.press("Backslash");
    await page.waitForTimeout(500);

    const appearanceButton = page
      .locator('[data-sidebar="menu-button"]')
      .filter({ hasText: "Appearance" });
    await expect(appearanceButton).toBeVisible({ timeout: 5000 });
    await appearanceButton.click();

    await page.getByRole("tab", { name: "Articles" }).click();
    await page.getByRole("radio", { name: "Serif", exact: true }).click();

    const fontSizeSection = page.locator("text=Font Size").locator("..");
    const increaseFontButton = fontSizeSection.locator("button").last();
    await increaseFontButton.click();

    await expect(fontSizeSection.getByText("19")).toBeVisible();

    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);

    // ── 7. Export Data ──────────────────────────────────────────────
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

      await settingsDialog
        .getByRole("button", { name: /export data/i })
        .click();
      await expect(
        settingsDialog.getByRole("heading", { name: "Export Data" }),
      ).toBeVisible({ timeout: 5000 });

      await settingsDialog.getByText("Group by Tag").click();

      const downloadPromise = page.waitForEvent("download");
      await settingsDialog
        .getByRole("button", { name: /export opml/i })
        .click();
      const download = await downloadPromise;

      const downloadPath = await download.path();
      expect(downloadPath).toBeTruthy();
      const tagOpmlContent = fs.readFileSync(downloadPath, "utf-8");

      expect(tagOpmlContent).toContain('<?xml version="1.0"');
      expect(tagOpmlContent).toContain('<opml version="2.0">');
      expect(tagOpmlContent).toContain("<head><title>Serial Export</title>");
      expect(tagOpmlContent).toContain("</opml>");

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

      const bodyMatch = tagOpmlContent.match(/<body>([\s\S]*?)<\/body>/);
      expect(bodyMatch).toBeTruthy();
      const bodyContent = bodyMatch?.[1] ?? "";
      const rootLevelFeedLines = bodyContent
        .split("\n")
        .filter((line) => /^\s{4}<outline type="rss"/.test(line));
      expect(rootLevelFeedLines.length).toBeGreaterThan(0);

      await settingsDialog.getByRole("button", { name: /^back$/i }).click();
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }

    // ── 8. Bulk Delete All Feeds ────────────────────────────────────
    await page.goto("/feeds");
    await expect(
      page.getByRole("tab", { name: /feeds/i, selected: true }),
    ).toBeVisible({
      timeout: 10000,
    });

    await expect(
      page.locator("main").getByRole("button", { name: /Scary Pockets/ }),
    ).toBeVisible({ timeout: 10000 });

    await page.keyboard.press("s");
    await page.keyboard.press("d");

    const deleteDialog = page.locator('[role="dialog"]');
    await expect(
      deleteDialog.getByRole("heading", { name: "Delete Feeds" }),
    ).toBeVisible();
    await deleteDialog.getByRole("button", { name: /^delete$/i }).click();

    await expect(
      deleteDialog.getByRole("heading", { name: "Delete Feeds" }),
    ).toBeHidden({ timeout: 10000 });

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
  });
});
