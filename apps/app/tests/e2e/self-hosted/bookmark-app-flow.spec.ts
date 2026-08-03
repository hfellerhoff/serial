import { expect, test } from "@playwright/test";
import {
  SELF_HOSTED_APP_PORT,
  SELF_HOSTED_TURSO_PORT,
} from "../fixtures/ports";
import {
  cleanupUser,
  getBookmarkState,
  seedArticleData,
  seedBookmarkProjectionData,
  seedExtensionSession,
} from "../fixtures/seed-db";
import { signIn } from "../fixtures/auth";

test.describe("Bookmark Serial-app flow", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  let testEmail: string;

  test.afterEach(async () => {
    if (testEmail) await cleanupUser(SELF_HOSTED_TURSO_PORT, testEmail);
  });

  test("renders the mixed card and protected native reader with state and progress", async ({
    page,
  }) => {
    const { email, password, feedItemId } = await seedArticleData(
      SELF_HOSTED_TURSO_PORT,
      SELF_HOSTED_APP_PORT,
    );
    testEmail = email;
    const { bookmarkId } = await seedBookmarkProjectionData(
      SELF_HOSTED_TURSO_PORT,
      email,
      feedItemId,
    );

    await page.route("https://images.example.com/**", (route) => route.abort());
    await page.route("https://www.youtube-nocookie.com/**", (route) =>
      route.abort(),
    );
    await signIn({ page, email, password });
    await page.getByRole("tab", { name: /Saved/ }).click();

    const bookmarkCard = page.locator(
      `article[data-item-id="${bookmarkId}"][data-entity-kind="bookmark"]`,
    );
    await expect(bookmarkCard).toContainText("Captured Bookmark", {
      timeout: 30_000,
    });
    await expect(
      page.locator(`article[data-item-id="${feedItemId}"]`),
    ).toHaveCount(0);

    await bookmarkCard.getByRole("link").click();
    await expect(page).toHaveURL(`/read/${bookmarkId}`);
    await expect(
      page.getByRole("heading", { name: "Captured Bookmark" }),
    ).toBeVisible();
    await expect(page.getByText("Captured Bookmark body")).toBeVisible();
    await expect(
      page.locator("script[data-testid=unsafe-capture-script]"),
    ).toHaveCount(0);

    const externalLink = page.getByRole("link", {
      name: "External reader link",
    });
    await expect(externalLink).toHaveAttribute("target", "_blank");
    await expect(externalLink).toHaveAttribute("rel", "noopener noreferrer");
    const remoteImage = page.getByAltText("Reader image");
    await expect(remoteImage).toHaveAttribute("referrerpolicy", "no-referrer");
    await expect(remoteImage).toHaveAttribute("loading", "lazy");
    const remoteImageTrigger = page.getByRole("button", {
      name: "Open image preview: Reader image",
    });
    await expect(
      page.locator('a[href="https://example.com/image-target"]'),
    ).toHaveCount(0);
    await remoteImageTrigger.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator("[data-article-video-embed]")).toBeVisible();
    await expect(page.getByTitle("YouTube video player")).toHaveAttribute(
      "src",
      /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/,
    );

    const readerArticle = page.locator("article");
    const initialArticleWidth = await readerArticle.evaluate(
      (article) => article.getBoundingClientRect().width,
    );
    await page
      .locator("header button")
      .filter({ has: page.locator("svg.lucide-plus") })
      .click();
    await expect
      .poll(() =>
        readerArticle.evaluate(
          (article) => article.getBoundingClientRect().width,
        ),
      )
      .toBeGreaterThan(initialArticleWidth);

    await page
      .locator("header button")
      .filter({ has: page.locator("svg.lucide-minus") })
      .click();
    await expect
      .poll(() =>
        readerArticle.evaluate(
          (article) => article.getBoundingClientRect().width,
        ),
      )
      .toBe(initialArticleWidth);

    const scrollContainer = page.locator('[data-slot="sidebar-inset"]');
    const scrollBox = await scrollContainer.boundingBox();
    if (scrollBox) {
      await page.mouse.move(
        scrollBox.x + scrollBox.width / 2,
        scrollBox.y + scrollBox.height / 2,
      );
    }
    for (let index = 0; index < 12; index += 1) {
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(50);
    }
    await expect
      .poll(
        async () =>
          (await getBookmarkState(SELF_HOSTED_TURSO_PORT, bookmarkId))
            ?.progress ?? 0,
      )
      .toBeGreaterThan(0);
    const savedBookmarkProgress = (
      await getBookmarkState(SELF_HOSTED_TURSO_PORT, bookmarkId)
    )?.progress;
    expect(savedBookmarkProgress).toBeGreaterThan(5);

    await page.goto("/");
    await page.getByRole("tab", { name: /Saved/ }).click();
    await expect(bookmarkCard).toBeVisible({ timeout: 15_000 });
    await bookmarkCard.getByRole("link").click();
    await expect(
      page.getByRole("heading", { name: "Captured Bookmark" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(() => scrollContainer.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("button", { name: "Archive" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Unsave" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Open in Website" }),
    ).toHaveCount(0);
    await expect(
      page.locator("header > span").last().getByRole("button"),
    ).toHaveCount(2);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);

    await page.getByRole("button", { name: /Archive/ }).click();
    await expect(page.getByRole("button", { name: /Unarchive/ })).toBeVisible();
    await page.getByRole("button", { name: "Unsave" }).click();
    await expect(page.getByRole("button", { name: "Save" })).toBeVisible();

    await page.mouse.wheel(0, 600);
    await expect
      .poll(async () => {
        const state = await getBookmarkState(
          SELF_HOSTED_TURSO_PORT,
          bookmarkId,
        );
        return {
          isSaved: state?.isSaved,
          isRead: state?.isRead,
          hasProgress: (state?.duration ?? 0) > 0,
        };
      })
      .toEqual({ isSaved: false, isRead: true, hasProgress: true });
  });

  test("renders the detected YouTube thumbnail instead of page metadata", async ({
    page,
    request,
  }) => {
    const { email, password } = await seedArticleData(
      SELF_HOSTED_TURSO_PORT,
      SELF_HOSTED_APP_PORT,
    );
    testEmail = email;
    const token = await seedExtensionSession(SELF_HOSTED_TURSO_PORT, email);
    const videoId = "dQw4w9WgXcQ";
    const sourceUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const saveResponse = await request.post("/api/extension/bookmarks", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        contractVersion: 2,
        sourceUrl,
        capture: {
          effectiveUrl: sourceUrl,
          title: "Detected YouTube Bookmark",
          thumbnailUrl: "https://metadata.example/standard-youtube.jpg",
          descriptor: {
            platform: "youtube",
            contentType: "video",
            orientation: null,
            contentId: videoId,
            classifierVersion: 1,
          },
        },
        feeds: [],
      },
    });
    expect(saveResponse.status()).toBe(201);
    const saved = (await saveResponse.json()) as { bookmark: { id: string } };

    await page.route("https://i.ytimg.com/**", (route) => route.abort());
    await signIn({ page, email, password });
    await page
      .getByRole("radio", { name: "Uncategorized", exact: true })
      .click();
    await page.getByRole("tab", { name: /Saved/ }).click();
    const bookmarkCard = page.locator(
      `article[data-item-id="${saved.bookmark.id}"][data-entity-kind="bookmark"]`,
    );
    await expect(bookmarkCard).toContainText("Detected YouTube Bookmark", {
      timeout: 30_000,
    });
    await expect(
      bookmarkCard.getByRole("img", { name: "Detected YouTube Bookmark" }),
    ).toHaveAttribute("src", `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`);
  });

  test("refreshes a duplicate without losing organization when capture fails", async ({
    page,
  }) => {
    const { email, password, feedItemId } = await seedArticleData(
      SELF_HOSTED_TURSO_PORT,
      SELF_HOSTED_APP_PORT,
    );
    testEmail = email;
    const { bookmarkId, sourceUrl } = await seedBookmarkProjectionData(
      SELF_HOSTED_TURSO_PORT,
      email,
      feedItemId,
    );
    await signIn({ page, email, password });
    await page.getByRole("tab", { name: /Saved/ }).click();
    const bookmarkCard = page.locator(
      `article[data-item-id="${bookmarkId}"][data-entity-kind="bookmark"]`,
    );
    await expect(bookmarkCard).toBeVisible({ timeout: 30_000 });
    await expect(
      bookmarkCard.getByTestId("empty-thumbnail-placeholder"),
    ).toBeVisible();

    await bookmarkCard.hover();
    await expect(
      bookmarkCard.getByRole("button", { name: "Copy Bookmark URL" }),
    ).toHaveCount(0);
    await expect
      .poll(() =>
        bookmarkCard
          .getByRole("button")
          .evaluateAll((buttons) =>
            buttons.map((button) => button.getAttribute("aria-label")),
          ),
      )
      .toEqual(["Delete Bookmark", "Edit Bookmark", "Unsave", "Archive"]);
    await bookmarkCard.getByRole("button", { name: "Edit Bookmark" }).click();

    const editDialog = page.getByRole("dialog");
    await expect(
      editDialog.getByRole("heading", { name: "Edit Bookmark" }),
    ).toBeAttached();
    await expect(
      editDialog.getByTestId("bookmark-capture-feedback"),
    ).toHaveCount(0);
    const deleteButton = editDialog.getByRole("button", {
      name: "Delete Bookmark",
    });
    const doneButton = editDialog.getByRole("button", { name: "Done" });
    await expect(deleteButton).toBeVisible();
    await expect(doneButton).toBeVisible();
    await expect
      .poll(async () => {
        const [deleteBox, doneBox] = await Promise.all([
          deleteButton.boundingBox(),
          doneButton.boundingBox(),
        ]);
        return Math.abs((deleteBox?.width ?? 0) - (doneBox?.width ?? 0));
      })
      .toBeLessThanOrEqual(1);
    await doneButton.click();
    await expect(editDialog).toHaveCount(0);

    await page.getByRole("button", { name: "Add Feed or Bookmark" }).click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByPlaceholder("Paste a URL or search for a feed...")
      .fill(sourceUrl);
    const bookmarkOption = dialog.getByRole("option", {
      name: /Bookmark page to read later/,
    });
    await expect(bookmarkOption).toBeVisible({ timeout: 10_000 });
    await bookmarkOption.click();

    const captureStatus = dialog.getByRole("button", {
      name: /previous Page capture is still available/i,
    });
    await expect(captureStatus).toBeVisible({ timeout: 20_000 });
    await captureStatus.focus();
    await expect(page.getByRole("tooltip")).toContainText(
      /previous Page capture is still available/i,
    );
    await expect(
      dialog
        .locator('[data-slot="selectable-chip-list"][data-label="Views"]')
        .getByRole("button", { name: "All" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      dialog.getByRole("link", { name: /Open Bookmark|Open original/ }),
    ).toHaveCount(0);
  });
});
