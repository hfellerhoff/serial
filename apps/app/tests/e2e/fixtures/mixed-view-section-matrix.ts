export type MixedViewSectionCase = {
  feedSectionFeedItem: boolean;
  tagSectionFeedItem: boolean;
  tagSectionBookmark: boolean;
  uncategorizedFeedItem: boolean;
  uncategorizedBookmark: boolean;
};

const CASE_DIMENSIONS: Array<keyof MixedViewSectionCase> = [
  "feedSectionFeedItem",
  "tagSectionFeedItem",
  "tagSectionBookmark",
  "uncategorizedFeedItem",
  "uncategorizedBookmark",
];

/**
 * Exhaustive Cartesian product of every valid entity/section placement.
 *
 * Feed sections can only contain feed items. Tag and Uncategorized sections
 * can independently contain a feed item, a Bookmark, both, or neither. That
 * gives five binary dimensions and 2^5 = 32 cases.
 */
export const MIXED_VIEW_SECTION_CASES: MixedViewSectionCase[] = Array.from(
  { length: 2 ** CASE_DIMENSIONS.length },
  (_, mask) =>
    Object.fromEntries(
      CASE_DIMENSIONS.map((dimension, bit) => [
        dimension,
        Boolean(mask & (1 << bit)),
      ]),
    ) as MixedViewSectionCase,
);

function contentLabel(feedItem: boolean, bookmark: boolean) {
  if (feedItem && bookmark) return "feed+bookmark";
  if (feedItem) return "feed";
  if (bookmark) return "bookmark";
  return "empty";
}

export function mixedViewSectionCaseName(testCase: MixedViewSectionCase) {
  return [
    `feed-section=${testCase.feedSectionFeedItem ? "feed" : "empty"}`,
    `tag-section=${contentLabel(
      testCase.tagSectionFeedItem,
      testCase.tagSectionBookmark,
    )}`,
    `uncategorized=${contentLabel(
      testCase.uncategorizedFeedItem,
      testCase.uncategorizedBookmark,
    )}`,
  ].join(" | ");
}
