import { describe, expect, it } from "vitest";

import type {
  ApplicationFeed,
  ApplicationView,
  ApplicationViewSection,
  DatabaseContentCategory,
  DatabaseFeedCategory,
  DatabaseViewFeed,
} from "~/server/db/schema";
import { getInitialFeedDataFromOPMLInput } from "~/components/feed/import/utils/getInitialFeedDataFromOPMLInput";
import { buildOPML } from "~/lib/data/export/buildOPML";
import { buildViewOPML } from "~/lib/data/export/buildViewOPML";
import { VIEW_LAYOUT_ITEM_TYPE } from "~/server/db/constants";

function makeFeed(id: number, name: string, url: string): ApplicationFeed {
  return {
    id,
    userId: "user-1",
    name,
    url,
    imageUrl: "",
    platform: "website",
    openLocation: "serial",
    isActive: true,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    lastFetchedAt: null,
    nextFetchAt: null,
    etag: null,
    lastModifiedHeader: null,
  };
}

function makeCategory(id: number, name: string): DatabaseContentCategory {
  return {
    id,
    userId: "user-1",
    name,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  };
}

function makeViewSection(
  viewId: number,
  placement: number,
  itemType: ApplicationViewSection["itemType"],
  itemId: number,
): ApplicationViewSection {
  return {
    id: placement + 1,
    viewId,
    placement,
    itemType,
    itemId,
    layout: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  };
}

function makeView(
  id: number,
  name: string,
  options: {
    categoryIds: number[];
    feedIds: number[];
    viewSections: ApplicationViewSection[];
  },
): ApplicationView {
  return {
    id,
    userId: "user-1",
    name,
    daysWindow: 0,
    readStatus: 0,
    orientation: "horizontal",
    contentType: "all",
    layout: "list",
    placement: 0,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    categoryIds: options.categoryIds,
    feedIds: options.feedIds,
    isDefault: false,
    viewSections: options.viewSections,
  };
}

describe("OPML import/export", () => {
  it("exports nested groups", () => {
    const opml = buildOPML({
      ungroupedFeeds: [],
      groups: [
        {
          name: "Videos",
          feeds: [
            {
              title: "Direct Feed",
              xmlUrl: "https://example.com/direct.xml",
              tags: ["Saved"],
            },
          ],
          outlineType: "view",
          groups: [
            {
              name: "Tech",
              outlineType: "tag",
              feeds: [
                {
                  title: "Fireship",
                  xmlUrl: "https://example.com/fireship.xml",
                  tags: ["JavaScript", "Video"],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(opml).toContain(
      '<outline title="Videos" text="Videos" serial:outlineType="view">',
    );
    expect(opml).toContain(
      '<outline title="Tech" text="Tech" serial:outlineType="tag">',
    );
    expect(opml).toContain(
      '<outline type="rss" title="Fireship" text="Fireship" xmlUrl="https://example.com/fireship.xml" category="JavaScript,Video" serial:tags="[&quot;JavaScript&quot;,&quot;Video&quot;]" />',
    );
  });

  it("imports nested outlines as category paths", () => {
    const result = getInitialFeedDataFromOPMLInput(`
      <?xml version="1.0" encoding="UTF-8"?>
      <opml version="2.0">
        <body>
          <outline title="Videos" text="Videos">
            <outline title="Tech" text="Tech">
              <outline type="rss" title="Fireship" text="Fireship" xmlUrl="https://example.com/fireship.xml" />
            </outline>
          </outline>
        </body>
      </opml>
    `);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.categories).toEqual(["Videos", "Tech"]);
    expect(result.data[0]?.categoryPaths).toEqual([
      [{ name: "Videos" }, { name: "Tech" }],
    ]);
  });

  it("keeps feed-named sections when they are nested inside a view and preserves subsection type", () => {
    const result = getInitialFeedDataFromOPMLInput(`
      <?xml version="1.0" encoding="UTF-8"?>
      <opml version="2.0" xmlns:serial="https://serial.tube/opml">
        <body>
          <outline title="Videos" text="Videos" serial:outlineType="view">
            <outline title="Fireship" text="Fireship" serial:outlineType="feed" serial:feedXmlUrl="https://example.com/fireship.xml">
              <outline type="rss" title="Fireship" text="Fireship" xmlUrl="https://example.com/fireship.xml" category="JavaScript" serial:tags="[&quot;JavaScript&quot;]" />
            </outline>
          </outline>
          <outline title="Test Blog" text="Test Blog">
            <outline type="rss" title="Test Blog" text="Test Blog" xmlUrl="https://example.com/test-blog.xml" />
          </outline>
        </body>
      </opml>
    `);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const fireship = result.data.find((feed) => feed.title === "Fireship");
    const testBlog = result.data.find((feed) => feed.title === "Test Blog");

    expect(fireship?.categoryPaths).toEqual([
      [
        { name: "Videos", type: "view" },
        {
          name: "Fireship",
          type: "feed",
          feedUrl: "https://example.com/fireship.xml",
        },
      ],
    ]);
    expect(fireship?.tagNames).toEqual(["JavaScript"]);
    expect(testBlog?.categories).toEqual([]);
    expect(testBlog?.categoryPaths).toBeUndefined();
  });

  it("differentiates feed and tag subsections with the same name", () => {
    const result = getInitialFeedDataFromOPMLInput(`
      <?xml version="1.0" encoding="UTF-8"?>
      <opml version="2.0" xmlns:serial="https://serial.tube/opml">
        <body>
          <outline title="Videos" text="Videos" serial:outlineType="view">
            <outline title="Tech" text="Tech" serial:outlineType="feed" serial:feedXmlUrl="https://example.com/tech.xml">
              <outline type="rss" title="Tech" text="Tech" xmlUrl="https://example.com/tech.xml" />
            </outline>
            <outline title="Tech" text="Tech" serial:outlineType="tag">
              <outline type="rss" title="Fireship" text="Fireship" xmlUrl="https://example.com/fireship.xml" />
            </outline>
          </outline>
        </body>
      </opml>
    `);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.map((feed) => feed.categoryPaths)).toEqual([
      [
        [
          { name: "Videos", type: "view" },
          {
            name: "Tech",
            type: "feed",
            feedUrl: "https://example.com/tech.xml",
          },
        ],
      ],
      [
        [
          { name: "Videos", type: "view" },
          { name: "Tech", type: "tag" },
        ],
      ],
    ]);
  });

  it("round-trips view subsections and feed tag assignments through export and import", () => {
    const feeds = [
      makeFeed(1, "Tech", "https://example.com/tech.xml"),
      makeFeed(2, "Fireship", "https://example.com/fireship.xml"),
      makeFeed(3, "Direct Feed", "https://example.com/direct.xml"),
      makeFeed(4, "Loose Feed", "https://example.com/loose.xml"),
    ];
    const contentCategories = [
      makeCategory(10, "Tech"),
      makeCategory(20, "JavaScript"),
      makeCategory(30, "Saved"),
      makeCategory(40, "Backlog"),
    ];
    const feedCategories: DatabaseFeedCategory[] = [
      { feedId: 1, categoryId: 10 },
      { feedId: 2, categoryId: 10 },
      { feedId: 2, categoryId: 20 },
      { feedId: 3, categoryId: 30 },
      { feedId: 4, categoryId: 40 },
    ];
    const viewId = 100;
    const views = [
      makeView(viewId, "Videos", {
        categoryIds: [10],
        feedIds: [3],
        viewSections: [
          makeViewSection(viewId, 0, VIEW_LAYOUT_ITEM_TYPE.FEED, 1),
          makeViewSection(viewId, 1, VIEW_LAYOUT_ITEM_TYPE.TAG, 10),
        ],
      }),
    ];
    const viewFeeds: DatabaseViewFeed[] = [{ viewId, feedId: 3 }];

    const opml = buildViewOPML({
      feeds,
      views,
      contentCategories,
      feedCategories,
      viewFeeds,
    });
    const result = getInitialFeedDataFromOPMLInput(opml);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const importedFeeds = new Map(
      result.data.map((feed) => [feed.feedUrl, feed]),
    );

    expect(importedFeeds.get("https://example.com/tech.xml")).toMatchObject({
      tagNames: ["Tech"],
      categoryPaths: [
        [
          { name: "Videos", type: "view" },
          {
            name: "Tech",
            type: "feed",
            feedUrl: "https://example.com/tech.xml",
          },
        ],
      ],
    });
    expect(importedFeeds.get("https://example.com/fireship.xml")).toMatchObject(
      {
        tagNames: ["JavaScript", "Tech"],
        categoryPaths: [
          [
            { name: "Videos", type: "view" },
            { name: "Tech", type: "tag" },
          ],
        ],
      },
    );
    expect(importedFeeds.get("https://example.com/direct.xml")).toMatchObject({
      tagNames: ["Saved"],
      categoryPaths: [[{ name: "Videos", type: "view" }]],
    });
    expect(importedFeeds.get("https://example.com/loose.xml")).toMatchObject({
      tagNames: ["Backlog"],
      categoryPaths: undefined,
    });
  });

  it("exports empty-filter custom views as all-feeds views", () => {
    const feeds = [
      makeFeed(1, "Tech", "https://example.com/tech.xml"),
      makeFeed(2, "Fireship", "https://example.com/fireship.xml"),
    ];
    const views = [
      makeView(200, "Everything", {
        categoryIds: [],
        feedIds: [],
        viewSections: [],
      }),
    ];

    const opml = buildViewOPML({
      feeds,
      views,
      contentCategories: [],
      feedCategories: [],
      viewFeeds: [],
    });
    const result = getInitialFeedDataFromOPMLInput(opml);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(
      result.data.map((feed) => ({
        feedUrl: feed.feedUrl,
        categoryPaths: feed.categoryPaths,
      })),
    ).toEqual([
      {
        feedUrl: "https://example.com/fireship.xml",
        categoryPaths: [[{ name: "Everything", type: "view" }]],
      },
      {
        feedUrl: "https://example.com/tech.xml",
        categoryPaths: [[{ name: "Everything", type: "view" }]],
      },
    ]);
  });
});
