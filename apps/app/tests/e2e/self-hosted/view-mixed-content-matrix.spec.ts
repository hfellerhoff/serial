import { expect, test } from "@playwright/test";
import { signIn } from "../fixtures/auth";
import { indexedDbKeys } from "../fixtures/indexed-db";
import {
  MIXED_VIEW_SECTION_CASES,
  mixedViewSectionCaseName,
} from "../fixtures/mixed-view-section-matrix";
import {
  SELF_HOSTED_APP_PORT,
  SELF_HOSTED_TURSO_PORT,
} from "../fixtures/ports";
import {
  cleanupUser,
  seedMixedViewSectionCase,
  seedSavedViewClientStateData,
} from "../fixtures/seed-db";
import type { Locator, Page } from "@playwright/test";

const caseNames = MIXED_VIEW_SECTION_CASES.map(mixedViewSectionCaseName);
if (
  MIXED_VIEW_SECTION_CASES.length !== 32 ||
  new Set(caseNames).size !== MIXED_VIEW_SECTION_CASES.length
) {
  throw new Error("Mixed View section matrix must contain 32 unique cases");
}

async function renderedItemIds(locator: Locator) {
  return (
    await locator.evaluateAll((elements) =>
      elements.flatMap((element) => {
        const itemId = element.getAttribute("data-item-id");
        return itemId ? [itemId] : [];
      }),
    )
  ).sort();
}

async function beginSkeletonObservation(page: Page) {
  await page.evaluate(() => {
    const state = window as typeof window & {
      __serialMatrixSkeletonSeen?: boolean;
      __serialMatrixSkeletonObserver?: MutationObserver;
    };
    state.__serialMatrixSkeletonSeen = Boolean(
      document.querySelector(".animate-pulse"),
    );
    state.__serialMatrixSkeletonObserver = new MutationObserver(() => {
      if (document.querySelector(".animate-pulse")) {
        state.__serialMatrixSkeletonSeen = true;
      }
    });
    state.__serialMatrixSkeletonObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  });
}

async function finishSkeletonObservation(page: Page) {
  return page.evaluate(() => {
    const state = window as typeof window & {
      __serialMatrixSkeletonSeen?: boolean;
      __serialMatrixSkeletonObserver?: MutationObserver;
    };
    state.__serialMatrixSkeletonObserver?.disconnect();
    return state.__serialMatrixSkeletonSeen ?? false;
  });
}

test.describe("exhaustive mixed-content View section matrix", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  let testEmail: string;

  test.afterEach(async () => {
    if (testEmail) await cleanupUser(SELF_HOSTED_TURSO_PORT, testEmail);
    testEmail = "";
  });

  for (const testCase of MIXED_VIEW_SECTION_CASES) {
    test(mixedViewSectionCaseName(testCase), async ({ page }) => {
      test.setTimeout(45_000);
      const fixture = await seedMixedViewSectionCase(
        SELF_HOSTED_TURSO_PORT,
        SELF_HOSTED_APP_PORT,
        testCase,
      );
      testEmail = fixture.email;

      const expectedSectionByItemId = new Map<string, number | null>([
        [
          fixture.items.feedSectionFeedItem,
          testCase.feedSectionFeedItem ? 0 : null,
        ],
        [
          fixture.items.tagSectionFeedItem,
          testCase.tagSectionFeedItem ? 1 : null,
        ],
        [
          fixture.items.tagSectionBookmark,
          testCase.tagSectionBookmark ? 1 : null,
        ],
        [
          fixture.items.uncategorizedFeedItem,
          testCase.uncategorizedFeedItem ? 2 : null,
        ],
        [
          fixture.items.uncategorizedBookmark,
          testCase.uncategorizedBookmark ? 2 : null,
        ],
        [fixture.items.outsideFeedItem, null],
        [fixture.items.outsideBookmark, null],
      ]);
      const expectedItemIds = [...expectedSectionByItemId.entries()]
        .flatMap(([itemId, sectionIndex]) =>
          sectionIndex === null ? [] : [itemId],
        )
        .sort();

      await signIn({
        page,
        email: fixture.email,
        password: fixture.password,
      });
      await page.getByRole("tab", { name: /Saved/ }).click();

      const feedMain = page
        .locator("main")
        .filter({
          has: page.getByRole("heading", { name: "Serial", exact: true }),
        })
        .last();
      const viewChip = feedMain.getByRole("radio", {
        name: fixture.viewName,
        exact: true,
      });
      await expect(viewChip).toBeVisible({ timeout: 30_000 });
      await expect
        .poll(() =>
          viewChip.evaluate((element) =>
            element.classList.contains("opacity-50"),
          ),
        )
        .toBe(expectedItemIds.length === 0);

      await beginSkeletonObservation(page);
      await viewChip.click();

      const renderedItems = feedMain.locator("article[data-item-id]");
      await expect
        .poll(() => renderedItemIds(renderedItems), { timeout: 30_000 })
        .toEqual(expectedItemIds);

      const sections = [0, 1, 2].map((sectionIndex) =>
        feedMain.locator(`#section-${sectionIndex}`),
      );
      if (expectedItemIds.length > 0) {
        await expect(feedMain.locator('[id^="section-"]')).toHaveCount(3);
      } else {
        await expect(feedMain.locator('[id^="section-"]')).toHaveCount(0);
      }

      for (const [itemId, expectedSectionIndex] of expectedSectionByItemId) {
        const globalItem = feedMain.locator(`[data-item-id="${itemId}"]`);
        await expect(globalItem).toHaveCount(
          expectedSectionIndex === null ? 0 : 1,
        );

        for (const [sectionIndex, section] of sections.entries()) {
          await expect(
            section.locator(`[data-item-id="${itemId}"]`),
          ).toHaveCount(sectionIndex === expectedSectionIndex ? 1 : 0);
        }
      }

      const expectedSectionItemIds = [0, 1, 2].map((sectionIndex) =>
        [...expectedSectionByItemId.entries()]
          .flatMap(([itemId, expectedSection]) =>
            expectedSection === sectionIndex ? [itemId] : [],
          )
          .sort(),
      );
      for (const [sectionIndex, section] of sections.entries()) {
        await expect
          .poll(() => renderedItemIds(section.locator("[data-item-id]")))
          .toEqual(expectedSectionItemIds[sectionIndex]);

        if (expectedSectionItemIds[sectionIndex]?.length) {
          await expect(section).toBeVisible();
        }
      }

      const expectedHeadings = ["Test Blog", fixture.tagName, "Uncategorized"];
      for (const [sectionIndex, section] of sections.entries()) {
        const heading = section.getByRole("heading", {
          name: expectedHeadings[sectionIndex],
          exact: true,
        });
        if (expectedSectionItemIds[sectionIndex]?.length) {
          await expect(heading).toBeVisible();
        } else {
          await expect(heading).toHaveCount(0);
        }
      }

      expect(await finishSkeletonObservation(page)).toBe(false);
    });
  }

  for (const visibility of ["unread", "later", "read"] as const) {
    const tabName = {
      unread: "Unread",
      later: "Saved",
      read: "Archived",
    }[visibility];

    test(`visibly renders configured feed, tag, and Uncategorized sections in ${tabName}`, async ({
      page,
    }) => {
      test.setTimeout(45_000);
      const fixture = await seedMixedViewSectionCase(
        SELF_HOSTED_TURSO_PORT,
        SELF_HOSTED_APP_PORT,
        {
          feedSectionFeedItem: true,
          tagSectionFeedItem: true,
          tagSectionBookmark: true,
          uncategorizedFeedItem: true,
          uncategorizedBookmark: true,
        },
        visibility,
      );
      testEmail = fixture.email;

      await signIn({
        page,
        email: fixture.email,
        password: fixture.password,
      });
      await page.getByRole("tab", { name: tabName, exact: false }).click();

      const feedMain = page
        .locator("main")
        .filter({
          has: page.getByRole("heading", { name: "Serial", exact: true }),
        })
        .last();
      await feedMain
        .getByRole("radio", { name: fixture.viewName, exact: true })
        .click();

      const expectedSections = [
        {
          name: "Test Blog",
          itemIds: [fixture.items.feedSectionFeedItem],
        },
        {
          name: fixture.tagName,
          itemIds: [
            fixture.items.tagSectionFeedItem,
            fixture.items.tagSectionBookmark,
          ],
        },
        {
          name: "Uncategorized",
          itemIds: [
            fixture.items.uncategorizedFeedItem,
            fixture.items.uncategorizedBookmark,
          ],
        },
      ];

      for (const [
        sectionIndex,
        expectedSection,
      ] of expectedSections.entries()) {
        const section = feedMain.locator(`#section-${sectionIndex}`);
        await expect(section).toBeVisible({ timeout: 30_000 });
        await expect(
          section.getByRole("heading", {
            name: expectedSection.name,
            exact: true,
          }),
        ).toBeVisible();
        await expect
          .poll(() => renderedItemIds(section.locator("[data-item-id]")))
          .toEqual([...expectedSection.itemIds].sort());
      }
    });
  }

  test("shows a feed item immediately after saving it and entering its View", async ({
    page,
  }) => {
    test.setTimeout(45_000);
    const fixture = await seedMixedViewSectionCase(
      SELF_HOSTED_TURSO_PORT,
      SELF_HOSTED_APP_PORT,
      {
        feedSectionFeedItem: true,
        tagSectionFeedItem: false,
        tagSectionBookmark: false,
        uncategorizedFeedItem: false,
        uncategorizedBookmark: false,
      },
      "unread",
    );
    testEmail = fixture.email;

    await signIn({
      page,
      email: fixture.email,
      password: fixture.password,
    });
    const feedMain = page
      .locator("main")
      .filter({
        has: page.getByRole("heading", { name: "Serial", exact: true }),
      })
      .last();
    await feedMain.getByRole("radio", { name: "All", exact: true }).click();

    const item = feedMain.locator(
      `article[data-item-id="${fixture.items.feedSectionFeedItem}"]`,
    );
    await expect(item).toBeVisible({ timeout: 30_000 });
    await item.getByRole("link").hover();
    await page.keyboard.press("s");

    await page.getByRole("tab", { name: "Saved", exact: false }).click();
    await feedMain
      .getByRole("radio", { name: fixture.viewName, exact: true })
      .click();
    await expect(item).toBeVisible({ timeout: 5_000 });
  });

  test("refreshes a loaded View when a newly saved item enters its visibility", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const fixture = await seedSavedViewClientStateData(
      SELF_HOSTED_TURSO_PORT,
      SELF_HOSTED_APP_PORT,
    );
    testEmail = fixture.email;

    await signIn({
      page,
      email: fixture.email,
      password: fixture.password,
    });
    const feedMain = page
      .locator("main")
      .filter({
        has: page.getByRole("heading", { name: "Serial", exact: true }),
      })
      .last();
    const targetViewChip = feedMain.getByRole("radio", {
      name: fixture.viewName,
      exact: true,
    });

    await page.getByRole("tab", { name: "Saved", exact: false }).click();
    await targetViewChip.click();
    await expect(feedMain.locator("article[data-item-id]").first()).toBeVisible(
      {
        timeout: 30_000,
      },
    );
    await page.mouse.wheel(0, 10_000);

    const loadedScopeKey =
      `serial-mixed-content-store-v2::normalized:v1::record:scopes:` +
      encodeURIComponent(`view:${fixture.targetViewId}:later`);
    await expect
      .poll(
        async () => {
          const keys = await indexedDbKeys(page);
          return keys.includes(loadedScopeKey);
        },
        { timeout: 30_000 },
      )
      .toBe(true);

    await page.getByRole("tab", { name: "Unread", exact: false }).click();
    const targetItem = feedMain.locator(
      `article[data-item-id="${fixture.targetItemId}"]`,
    );
    await expect(targetItem).toBeVisible({ timeout: 30_000 });
    await targetItem.getByRole("link").hover();
    await page.keyboard.press("s");

    await page.getByRole("tab", { name: "Saved", exact: false }).click();
    await expect(targetItem).toBeVisible({ timeout: 5_000 });
  });

  test("renders mixed Feed items and Bookmarks in configured sections in Read", async ({
    page,
  }) => {
    test.setTimeout(45_000);
    const fullyMixedCase = {
      feedSectionFeedItem: true,
      tagSectionFeedItem: true,
      tagSectionBookmark: true,
      uncategorizedFeedItem: true,
      uncategorizedBookmark: true,
    };
    const fixture = await seedMixedViewSectionCase(
      SELF_HOSTED_TURSO_PORT,
      SELF_HOSTED_APP_PORT,
      fullyMixedCase,
      "read",
    );
    testEmail = fixture.email;

    await signIn({
      page,
      email: fixture.email,
      password: fixture.password,
    });
    await page.getByRole("tab", { name: /Archived/ }).click();

    const feedMain = page
      .locator("main")
      .filter({
        has: page.getByRole("heading", { name: "Serial", exact: true }),
      })
      .last();
    await feedMain
      .getByRole("radio", { name: fixture.viewName, exact: true })
      .click();

    const expectedSectionItemIds = [
      [fixture.items.feedSectionFeedItem],
      [fixture.items.tagSectionFeedItem, fixture.items.tagSectionBookmark],
      [
        fixture.items.uncategorizedFeedItem,
        fixture.items.uncategorizedBookmark,
      ],
    ].map((ids) => ids.sort());
    const sections = [0, 1, 2].map((sectionIndex) =>
      feedMain.locator(`#section-${sectionIndex}`),
    );

    await expect(feedMain.locator('[id^="section-"]')).toHaveCount(3);
    for (const [sectionIndex, section] of sections.entries()) {
      await expect
        .poll(() => renderedItemIds(section.locator("[data-item-id]")))
        .toEqual(expectedSectionItemIds[sectionIndex]);
    }
    await expect(
      feedMain.locator(`[data-item-id="${fixture.items.outsideFeedItem}"]`),
    ).toHaveCount(0);
    await expect(
      feedMain.locator(`[data-item-id="${fixture.items.outsideBookmark}"]`),
    ).toHaveCount(0);

    const emptyViewChip = feedMain.getByRole("radio", {
      name: fixture.emptyViewName,
      exact: true,
    });
    await expect(emptyViewChip).toHaveClass(/opacity-50/);
    await emptyViewChip.click();
    await expect(feedMain.locator("article[data-item-id]")).toHaveCount(0);
  });
});
