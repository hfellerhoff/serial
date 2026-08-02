import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ThumbnailLayout } from "~/components/feed/view-lists/ItemDisplay";
import { BookmarkThumbnail } from "~/components/feed/view-lists/ItemDisplay";

const ICON_URL = "https://example.com/favicon.png";
const THUMBNAIL_URL = "https://example.com/thumbnail.jpg";
const LAYOUTS: ThumbnailLayout[] = ["list", "large-list", "grid", "large-grid"];

type ExpectedMedia = {
  thumbnail: boolean;
  icon: boolean;
  placeholder: boolean;
};

const allLayouts = (expected: ExpectedMedia) =>
  Object.fromEntries(LAYOUTS.map((layout) => [layout, expected])) as Record<
    ThumbnailLayout,
    ExpectedMedia
  >;

const MEDIA_CASES = [
  {
    name: "thumbnail and icon",
    thumbnailUrl: THUMBNAIL_URL,
    iconUrl: ICON_URL,
    expected: {
      list: { thumbnail: false, icon: true, placeholder: false },
      "large-list": { thumbnail: true, icon: true, placeholder: false },
      grid: { thumbnail: true, icon: true, placeholder: false },
      "large-grid": { thumbnail: true, icon: true, placeholder: false },
    },
  },
  {
    name: "thumbnail only",
    thumbnailUrl: THUMBNAIL_URL,
    iconUrl: null,
    expected: {
      list: { thumbnail: false, icon: false, placeholder: true },
      "large-list": { thumbnail: true, icon: false, placeholder: false },
      grid: { thumbnail: true, icon: false, placeholder: false },
      "large-grid": { thumbnail: true, icon: false, placeholder: false },
    },
  },
  {
    name: "icon only",
    thumbnailUrl: null,
    iconUrl: ICON_URL,
    expected: allLayouts({
      thumbnail: false,
      icon: true,
      placeholder: false,
    }),
  },
  {
    name: "neither",
    thumbnailUrl: null,
    iconUrl: null,
    expected: allLayouts({
      thumbnail: false,
      icon: false,
      placeholder: true,
    }),
  },
] as const;

describe("BookmarkThumbnail", () => {
  for (const mediaCase of MEDIA_CASES) {
    for (const layout of LAYOUTS) {
      it(`${mediaCase.name} in ${layout}`, () => {
        const markup = renderToStaticMarkup(
          createElement(BookmarkThumbnail, {
            layout,
            bookmark: {
              duration: 0,
              iconUrl: mediaCase.iconUrl,
              orientation: null,
              platform: "website",
              progress: 0,
              siteName: "Example",
              thumbnailUrl: mediaCase.thumbnailUrl,
              title: "Example Bookmark",
            },
          }),
        );
        const expected = mediaCase.expected[layout];

        expect(markup.includes(THUMBNAIL_URL)).toBe(expected.thumbnail);
        expect(markup.includes(ICON_URL)).toBe(expected.icon);
        expect(
          markup.includes('data-testid="empty-thumbnail-placeholder"'),
        ).toBe(expected.placeholder);
      });
    }
  }
});
