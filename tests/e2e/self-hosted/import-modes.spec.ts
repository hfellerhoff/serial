import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { signUp } from "../fixtures/auth";
import { SELF_HOSTED_TURSO_PORT } from "../fixtures/ports";
import { cleanupUser, generateTestEmail } from "../fixtures/seed-db";
import type { Page } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SECTIONED_OPML_PATH = path.join(
  __dirname,
  "../fixtures/sectioned-subscriptions.opml",
);

/**
 * Drives the /import flow with the sectioned OPML fixture and the given
 * import mode (Views / Tags / Ignore section radio).
 */
async function importSectionedOpml(
  page: Page,
  importMode: "views" | "tags" | "ignore",
) {
  await page.goto("/import");
  await expect(page.getByText("Import Feeds")).toBeVisible();

  const dropzone = page.getByText(/drag and drop/i);
  await expect(dropzone).toBeVisible();
  await page.locator('input[data-ready="true"]').waitFor({ timeout: 10000 });

  const fileChooserPromise = page.waitForEvent("filechooser");
  await dropzone.click();
  const fileChooser = await fileChooserPromise;
  const buffer = fs.readFileSync(SECTIONED_OPML_PATH);
  await fileChooser.setFiles({
    name: "sectioned-subscriptions.opml",
    mimeType: "application/xml",
    buffer,
  });

  // The "Sections" radio only appears when at least one feed has a section.
  // Wait for it, then pick the desired mode.
  await expect(page.getByRole("heading", { name: "Sections" })).toBeVisible({
    timeout: 10000,
  });

  const optionLabel = {
    views: "Import sections as Views",
    tags: "Import sections as Tags",
    ignore: "Ignore sections",
  }[importMode];
  await page.getByText(optionLabel).click();

  const importButton = page.getByRole("button", {
    name: /import \d+ feeds/i,
  });
  await expect(importButton).toBeEnabled({ timeout: 10000 });
  await importButton.click();

  await expect(page.getByText("Import finished")).toBeVisible({
    timeout: 60000,
  });
}

async function openLeftSidebar(page: Page) {
  await page.keyboard.press("Backslash");
  await page.waitForTimeout(300);
}

test.describe("import categorization modes", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  let testEmail: string;

  test.afterEach(async () => {
    if (testEmail) {
      await cleanupUser(SELF_HOSTED_TURSO_PORT, testEmail);
    }
  });

  test('"views" mode: sections become views, feeds linked, same-name section ignored', async ({
    page,
  }) => {
    test.setTimeout(120000);
    testEmail = generateTestEmail();

    await signUp({
      page,
      name: "Views Mode User",
      email: testEmail,
      password: "testpassword123",
    });

    await importSectionedOpml(page, "views");

    // Go home and open the sidebar so we can inspect Views and Tags groups
    await page.goto("/");
    await openLeftSidebar(page);

    const viewsSection = page
      .locator('[data-sidebar="group"]')
      .filter({ hasText: "Views" });
    const tagsSection = page
      .locator('[data-sidebar="group"]')
      .filter({ hasText: "Tags" });

    // Real sections should become views
    await expect(viewsSection.getByText("Music")).toBeVisible({
      timeout: 10000,
    });
    await expect(viewsSection.getByText("Tech")).toBeVisible();

    // Same-name section ("Test Blog" wraps a "Test Blog" feed) must NOT
    // become a view because it isn't a real section.
    await expect(viewsSection.getByText("Test Blog")).toHaveCount(0);

    // Bare feed CGP Grey must NOT have a view created for it
    await expect(viewsSection.getByText("CGP Grey")).toHaveCount(0);

    // No tags should be created in views mode
    await expect(tagsSection.getByText("Music")).toHaveCount(0);
    await expect(tagsSection.getByText("Tech")).toHaveCount(0);

    // Verify the feed-to-view assignment via the /feeds page badges
    await page.goto("/feeds");
    await expect(
      page.getByRole("tab", { name: /feeds/i, selected: true }),
    ).toBeVisible();
    const main = page.locator("main");
    await expect(
      main
        .getByRole("button", { name: /Scary Pockets/ })
        .locator('[data-slot="badge"]')
        .filter({ hasText: "Music" }),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      main
        .getByRole("button", { name: /Fireship/ })
        .locator('[data-slot="badge"]')
        .filter({ hasText: "Tech" }),
    ).toBeVisible();
    // The Test Blog feed should have NO badges (the only candidate "Test
    // Blog" section was filtered as same-name).
    await expect(
      main
        .getByRole("button", { name: /Test Blog/ })
        .locator('[data-slot="badge"]'),
    ).toHaveCount(0);
  });

  test('"tags" mode: sections become tags, feeds tagged, same-name section ignored', async ({
    page,
  }) => {
    test.setTimeout(120000);
    testEmail = generateTestEmail();

    await signUp({
      page,
      name: "Tags Mode User",
      email: testEmail,
      password: "testpassword123",
    });

    await importSectionedOpml(page, "tags");

    await page.goto("/");
    await openLeftSidebar(page);

    const viewsSection = page
      .locator('[data-sidebar="group"]')
      .filter({ hasText: "Views" });
    const tagsSection = page
      .locator('[data-sidebar="group"]')
      .filter({ hasText: "Tags" });

    // Real sections should become tags
    await expect(tagsSection.getByText("Music")).toBeVisible({
      timeout: 10000,
    });
    await expect(tagsSection.getByText("Tech")).toBeVisible();

    // Same-name section must NOT become a tag
    await expect(tagsSection.getByText("Test Blog")).toHaveCount(0);
    // Bare feed must NOT become a tag
    await expect(tagsSection.getByText("CGP Grey")).toHaveCount(0);

    // No custom views in tags mode (only the default Uncategorized view)
    await expect(viewsSection.getByText("Music")).toHaveCount(0);
    await expect(viewsSection.getByText("Tech")).toHaveCount(0);

    // Verify the feed-to-tag assignment via the /feeds page badges
    await page.goto("/feeds");
    await expect(
      page.getByRole("tab", { name: /feeds/i, selected: true }),
    ).toBeVisible();
    const main = page.locator("main");
    await expect(
      main
        .getByRole("button", { name: /Scary Pockets/ })
        .locator('[data-slot="badge"]')
        .filter({ hasText: "Music" }),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      main
        .getByRole("button", { name: /Fireship/ })
        .locator('[data-slot="badge"]')
        .filter({ hasText: "Tech" }),
    ).toBeVisible();
    await expect(
      main
        .getByRole("button", { name: /Test Blog/ })
        .locator('[data-slot="badge"]'),
    ).toHaveCount(0);
  });

  test('"ignore" mode: no views or tags created, just feeds', async ({
    page,
  }) => {
    test.setTimeout(120000);
    testEmail = generateTestEmail();

    await signUp({
      page,
      name: "Ignore Mode User",
      email: testEmail,
      password: "testpassword123",
    });

    await importSectionedOpml(page, "ignore");

    await page.goto("/");
    await openLeftSidebar(page);

    const viewsSection = page
      .locator('[data-sidebar="group"]')
      .filter({ hasText: "Views" });
    const tagsSection = page
      .locator('[data-sidebar="group"]')
      .filter({ hasText: "Tags" });

    // Wait for Feeds to load to be sure import has fully reflected
    const feedsSection = page
      .locator('[data-sidebar="group"]')
      .filter({ hasText: "Feeds" });
    await expect(
      feedsSection.getByRole("button", { name: "Scary Pockets" }),
    ).toBeVisible({ timeout: 10000 });

    // No views or tags should be created from sections in ignore mode
    await expect(viewsSection.getByText("Music")).toHaveCount(0);
    await expect(viewsSection.getByText("Tech")).toHaveCount(0);
    await expect(tagsSection.getByText("Music")).toHaveCount(0);
    await expect(tagsSection.getByText("Tech")).toHaveCount(0);

    // Verify no badges on /feeds page either
    await page.goto("/feeds");
    await expect(
      page.getByRole("tab", { name: /feeds/i, selected: true }),
    ).toBeVisible();
    const main = page.locator("main");
    await expect(
      main
        .getByRole("button", { name: /Scary Pockets/ })
        .locator('[data-slot="badge"]'),
    ).toHaveCount(0);
    await expect(
      main
        .getByRole("button", { name: /Fireship/ })
        .locator('[data-slot="badge"]'),
    ).toHaveCount(0);
  });
});
