import { expect, test } from "@playwright/test";
import { signIn } from "../fixtures/auth";
import {
  SELF_HOSTED_APP_PORT,
  SELF_HOSTED_TURSO_PORT,
} from "../fixtures/ports";
import { cleanupUser, seedYouTubeVideoData } from "../fixtures/seed-db";
import type { Page } from "@playwright/test";

async function mockYouTubePlayerError(page: Page, errorCode: number) {
  await page.route(/\/\/www\.youtube\.com\/iframe_api/, async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: `
        (() => {
          class MockYouTubePlayer {
            constructor(element, options) {
              this.element = typeof element === "string" ? document.getElementById(element) : element;
              this.options = options;
              this.listeners = {};
              this.iframe = document.createElement("iframe");
              this.iframe.src = "https://www.youtube-nocookie.com/embed/" + (options.videoId || "");
              this.iframe.title = "YouTube video player";
              this.element.appendChild(this.iframe);

              setTimeout(() => {
                options.events.onReady({ target: this });
                setTimeout(() => {
                  options.events.onError({ data: ${errorCode}, target: this });
                }, 0);
              }, 0);
            }

            addEventListener(eventName, listener) {
              this.listeners[eventName] = listener;
            }

            removeEventListener(eventName) {
              delete this.listeners[eventName];
            }

            cueVideoById() {}
            loadVideoById() {}
            cueVideoByUrl() {}
            loadVideoByUrl() {}
            playVideo() {}
            pauseVideo() {}
            stopVideo() {}
            getVideoLoadedFraction() { return 0; }
            cuePlaylist() {}
            loadPlaylist() {}
            nextVideo() {}
            previousVideo() {}
            playVideoAt() {}
            setShuffle() {}
            setLoop() {}
            getPlaylist() { return []; }
            getPlaylistIndex() { return 0; }
            setOption() {}
            mute() {}
            unMute() {}
            isMuted() { return false; }
            setVolume() {}
            getVolume() { return 100; }
            seekTo() {}
            getPlayerState() { return -1; }
            getPlaybackRate() { return 1; }
            setPlaybackRate() {}
            getAvailablePlaybackRates() { return [1]; }
            getPlaybackQuality() { return "default"; }
            setPlaybackQuality() {}
            getAvailableQualityLevels() { return []; }
            getCurrentTime() { return 0; }
            getDuration() { return 0; }
            getVideoUrl() { return ""; }
            getVideoEmbedCode() { return ""; }
            getOptions() { return []; }
            getOption() { return null; }
            destroy() { this.iframe.remove(); }
            setSize() {}
            getIframe() { return this.iframe; }
            loadModule() {}
          }

          window.YT = {
            Player: MockYouTubePlayer,
            PlayerState: {
              UNSTARTED: -1,
              ENDED: 0,
              PLAYING: 1,
              PAUSED: 2,
              BUFFERING: 3,
              CUED: 5,
            },
          };
          window.onYouTubeIframeAPIReady();
        })();
      `,
    });
  });
}

test.describe("custom video player", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  let testEmail: string;

  test.afterEach(async () => {
    if (testEmail) {
      await cleanupUser(SELF_HOSTED_TURSO_PORT, testEmail);
    }
  });

  test("shows a Watch on YouTube CTA when the embedded player errors", async ({
    page,
  }) => {
    const { email, password, feedItemId, originalUrl } =
      await seedYouTubeVideoData(SELF_HOSTED_TURSO_PORT, SELF_HOSTED_APP_PORT);
    testEmail = email;

    await mockYouTubePlayerError(page, 150);
    await signIn({ page, email, password });
    await page.goto(`/watch/${feedItemId}`);

    const watchOnYouTubeButton = page.getByRole("button", {
      name: "This YouTube video cannot be played in embedded players.",
    });
    await expect(watchOnYouTubeButton).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Watch on YouTube")).toBeVisible();

    const popupPromise = page.waitForEvent("popup");
    await watchOnYouTubeButton.click();
    const popup = await popupPromise;

    await expect(popup).toHaveURL(originalUrl);
  });
});
