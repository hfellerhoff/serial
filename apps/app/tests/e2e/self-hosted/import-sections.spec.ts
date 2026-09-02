import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { signUp } from "../fixtures/auth";
import {
  SELF_HOSTED_RSS_SERVER_PORT,
  SELF_HOSTED_TURSO_PORT,
} from "../fixtures/ports";
import {
  cleanupUser,
  generateTestEmail,
  getViewSectionsForUser,
  getViewsForUser,
} from "../fixtures/seed-db";
import { readOpmlFixture } from "../fixtures/opml";
import { openSidebar } from "../fixtures/sidebar";
import type { Page } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SECTIONED_OPML_PATH = path.join(
  __dirname,
  "../fixtures/sectioned-subscriptions.opml",
);
const PLAIN_OPML_PATH = path.join(__dirname, "../fixtures/subscriptions.opml");
const NESTED_OPML_PATH = path.join(
  __dirname,
  "../fixtures/nested-subscriptions.opml",
);

/** Drives the /import flow with the given OPML fixture. */
async function importOpml(page: Page, fixturePath: string) {
  await page.goto("/import");
  await expect(page.getByText("Import Feeds")).toBeVisible();

  const dropzone = page.getByText(/drag and drop/i);
  await expect(dropzone).toBeVisible();
  await page.locator('input[data-ready="true"]').waitFor({ timeout: 10000 });

  const fileChooserPromise = page.waitForEvent("filechooser");
  await dropzone.click();
  const fileChooser = await fileChooserPromise;
  const buffer = Buffer.from(
    readOpmlFixture(fixturePath, SELF_HOSTED_RSS_SERVER_PORT),
  );
  await fileChooser.setFiles({
    name: path.basename(fixturePath),
    mimeType: "application/xml",
    buffer,
  });

  const importButton = page.getByRole("button", {
    name: /import \d+ feeds/i,
  });
  await expect(importButton).toBeEnabled({ timeout: 10000 });
  await importButton.click();

  await expect(page.getByText("Import finished")).toBeVisible({
    timeout: 60000,
  });
}

test.describe("import sections as views", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  let testEmail: string;

  test.afterEach(async () => {
    if (testEmail) {
      await cleanupUser(SELF_HOSTED_TURSO_PORT, testEmail);
    }
  });

  test("sections become views, feeds linked, same-name section ignored", async ({
    page,
  }) => {
    test.setTimeout(30000);
    testEmail = generateTestEmail();

    await signUp({
      page,
      name: "Sections User",
      email: testEmail,
      password: "testpassword123",
    });

    await importSectionedOpmlAndVerifyDb(page, testEmail);

    // Navigate home client-side (no reload) — the imported views must already
    // have been delivered to the running client, not just persisted server-side.
    await page.getByRole("link", { name: "Back to home" }).click();
    await openSidebar(page);

    const viewsSection = page
      .locator('[data-sidebar="group"]')
      .filter({ hasText: "Views" });
    const tagsSection = page
      .locator('[data-sidebar="group"]')
      .filter({ hasText: "Tags" });

    // Real sections should become views
    await expect(viewsSection.getByText("Music")).toBeVisible({
      timeout: 5000,
    });
    await expect(viewsSection.getByText("Tech")).toBeVisible();

    // Same-name section ("Test Blog" wraps a "Test Blog" feed) must NOT
    // become a view because it isn't a real section.
    await expect(viewsSection.getByText("Test Blog")).toHaveCount(0);

    // Bare feed CGP Grey must NOT have a view created for it
    await expect(viewsSection.getByText("CGP Grey")).toHaveCount(0);

    // Sections never become tags
    await expect(tagsSection.getByText("Music")).toHaveCount(0);
    await expect(tagsSection.getByText("Tech")).toHaveCount(0);

    await verifyViewBadgesOnFeedsPage(page);
  });

  test("re-import links already-existing feeds into the imported views", async ({
    page,
  }) => {
    test.setTimeout(45000);
    testEmail = generateTestEmail();

    await signUp({
      page,
      name: "Reimport User",
      email: testEmail,
      password: "testpassword123",
    });

    // First import the same feeds without sections — no views are created.
    await importOpml(page, PLAIN_OPML_PATH);
    expect(
      (await getViewsForUser(SELF_HOSTED_TURSO_PORT, testEmail)).filter(
        (view) => ["Music", "Tech"].includes(view.name),
      ),
    ).toEqual([]);

    // Re-import the sectioned export: every feed already exists, but the
    // sections must still become views with the existing feeds linked in.
    await page.getByRole("button", { name: "Import more" }).click();
    await importSectionedOpmlAndVerifyDb(page, testEmail);

    await page.goto("/");
    await openSidebar(page);

    const viewsSection = page
      .locator('[data-sidebar="group"]')
      .filter({ hasText: "Views" });
    await expect(viewsSection.getByText("Music")).toBeVisible({
      timeout: 10000,
    });
    await expect(viewsSection.getByText("Tech")).toBeVisible();

    // The exported serial:tags apply to the already-subscribed feed too.
    const tagsSection = page
      .locator('[data-sidebar="group"]')
      .filter({ hasText: "Tags" });
    await expect(tagsSection.getByText("Funk")).toBeVisible({
      timeout: 10000,
    });

    await verifyViewBadgesOnFeedsPage(page);
    await expect(
      page
        .locator("main")
        .getByRole("button", { name: /Scary Pockets/ })
        .locator("..")
        .locator('[data-slot="badge"]')
        .filter({ hasText: "Funk" }),
    ).toBeVisible();
  });

  test("nested folders become ordered view sections and are not duplicated on re-import", async ({
    page,
  }) => {
    test.setTimeout(60000);
    testEmail = generateTestEmail();

    await signUp({
      page,
      name: "Nested Sections User",
      email: testEmail,
      password: "testpassword123",
    });

    await importOpml(page, NESTED_OPML_PATH);

    // The "Jazz" tag folder and the "Fireship" feed subsection become ordered
    // sections of the "Music" view, following their order in the file.
    const expectedSections = [
      { viewName: "Music", itemType: "tag", itemName: "Jazz", placement: 0 },
      {
        viewName: "Music",
        itemType: "feed",
        itemName: "Fireship",
        placement: 1,
      },
    ];
    await expect
      .poll(() => getViewSectionsForUser(SELF_HOSTED_TURSO_PORT, testEmail), {
        timeout: 10_000,
      })
      .toEqual(expectedSections);

    // Re-importing the same export must reuse the view and its sections
    // instead of duplicating them.
    await page.getByRole("button", { name: "Import more" }).click();
    await importOpml(page, NESTED_OPML_PATH);
    expect(
      await getViewSectionsForUser(SELF_HOSTED_TURSO_PORT, testEmail),
    ).toEqual(expectedSections);

    await page.goto("/");
    await openSidebar(page);
    const viewsSection = page
      .locator('[data-sidebar="group"]')
      .filter({ hasText: "Views" });
    const tagsSection = page
      .locator('[data-sidebar="group"]')
      .filter({ hasText: "Tags" });
    await expect(viewsSection.getByText("Music")).toBeVisible({
      timeout: 10000,
    });
    await expect(tagsSection.getByText("Jazz")).toBeVisible();

    // The feed inside the tag folder carries both the view and the tag.
    await page.goto("/feeds");
    await expect(
      page.getByRole("tab", { name: /feeds/i, selected: true }),
    ).toBeVisible();
    const main = page.locator("main");
    const jazzCatsBadges = main
      .getByRole("button", { name: /Jazz Cats/ })
      .locator("..")
      .locator('[data-slot="badge"]');
    await expect(jazzCatsBadges.filter({ hasText: "Music" })).toBeVisible({
      timeout: 10000,
    });
    await expect(jazzCatsBadges.filter({ hasText: "Jazz" })).toBeVisible();
  });
});

async function importSectionedOpmlAndVerifyDb(page: Page, testEmail: string) {
  await importOpml(page, SECTIONED_OPML_PATH);

  await expect
    .poll(
      async () => {
        const importedViews = await getViewsForUser(
          SELF_HOSTED_TURSO_PORT,
          testEmail,
        );
        return importedViews
          .filter((view) => ["Music", "Tech"].includes(view.name))
          .map((view) => view.layout);
      },
      { timeout: 10_000 },
    )
    .toEqual(["large-list", "large-list"]);
}

async function verifyViewBadgesOnFeedsPage(page: Page) {
  await page.goto("/feeds");
  await expect(
    page.getByRole("tab", { name: /feeds/i, selected: true }),
  ).toBeVisible();
  const main = page.locator("main");
  await expect(
    main
      .getByRole("button", { name: /Scary Pockets/ })
      .locator("..")
      .locator('[data-slot="badge"]')
      .filter({ hasText: "Music" }),
  ).toBeVisible({ timeout: 10000 });
  await expect(
    main
      .getByRole("button", { name: /Fireship/ })
      .locator("..")
      .locator('[data-slot="badge"]')
      .filter({ hasText: "Tech" }),
  ).toBeVisible();
  // The Test Blog feed should have NO badges (the only candidate "Test
  // Blog" section was filtered as same-name).
  await expect(
    main
      .getByRole("button", { name: /Test Blog/ })
      .locator("..")
      .locator('[data-slot="badge"]'),
  ).toHaveCount(0);
}
