import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { ContentType, VideoOrientation } from "~/lib/content/descriptor";
import {
  CONTENT_TYPE,
  effectiveVideoOrientation,
  VIDEO_ORIENTATION,
} from "~/lib/content/descriptor";

export const CONTENT_FILTER_OPTION = {
  TEXT: "text",
  VIDEOS: "videos",
  SHORTS: "shorts",
} as const;

export type ContentFilterOption =
  (typeof CONTENT_FILTER_OPTION)[keyof typeof CONTENT_FILTER_OPTION];

const CONTENT_FILTER_BIT = {
  [CONTENT_FILTER_OPTION.TEXT]: 1,
  [CONTENT_FILTER_OPTION.VIDEOS]: 2,
  [CONTENT_FILTER_OPTION.SHORTS]: 4,
} as const;

export const contentFilterSchema = z.number().int().min(1).max(7);
export type ContentFilter = z.infer<typeof contentFilterSchema>;

export const DEFAULT_CONTENT_FILTER = encodeContentFilter([
  CONTENT_FILTER_OPTION.TEXT,
  CONTENT_FILTER_OPTION.VIDEOS,
]);

export const ALL_CONTENT_FILTER = encodeContentFilter([
  CONTENT_FILTER_OPTION.TEXT,
  CONTENT_FILTER_OPTION.VIDEOS,
  CONTENT_FILTER_OPTION.SHORTS,
]);

export function encodeContentFilter(
  options: readonly ContentFilterOption[],
): ContentFilter {
  const encoded = options.reduce(
    (value, option) => value | CONTENT_FILTER_BIT[option],
    0,
  );
  return contentFilterSchema.parse(encoded);
}

export function decodeContentFilter(
  filter: ContentFilter,
): ContentFilterOption[] {
  const validated = contentFilterSchema.parse(filter);
  return Object.values(CONTENT_FILTER_OPTION).filter(
    (option) => (validated & CONTENT_FILTER_BIT[option]) !== 0,
  );
}

export function hasContentFilterOption(
  filter: ContentFilter,
  option: ContentFilterOption,
) {
  return (contentFilterSchema.parse(filter) & CONTENT_FILTER_BIT[option]) !== 0;
}

export function toggleContentFilterOption(
  filter: ContentFilter,
  option: ContentFilterOption,
): ContentFilter {
  const next = contentFilterSchema.parse(filter) ^ CONTENT_FILTER_BIT[option];
  return contentFilterSchema.parse(next);
}

export function contentFilterAllowsDescriptor(
  filter: ContentFilter,
  descriptor: {
    contentType: ContentType;
    orientation: VideoOrientation | null;
  },
) {
  if (descriptor.contentType === CONTENT_TYPE.TEXT) {
    return hasContentFilterOption(filter, CONTENT_FILTER_OPTION.TEXT);
  }
  return effectiveVideoOrientation(descriptor.orientation) ===
    VIDEO_ORIENTATION.VERTICAL
    ? hasContentFilterOption(filter, CONTENT_FILTER_OPTION.SHORTS)
    : hasContentFilterOption(filter, CONTENT_FILTER_OPTION.VIDEOS);
}

type SqlColumn = Parameters<typeof eq>[0];

export function contentFilterColumnHasOption(
  filterColumn: SqlColumn,
  option: ContentFilterOption,
) {
  return sql`(${filterColumn} & ${CONTENT_FILTER_BIT[option]}) != 0`;
}

export function contentFilterColumnAllowsDescriptor(input: {
  filter: SqlColumn;
  contentType: SqlColumn;
  orientation: SqlColumn;
}) {
  return or(
    and(
      contentFilterColumnHasOption(input.filter, CONTENT_FILTER_OPTION.TEXT),
      eq(input.contentType, CONTENT_TYPE.TEXT),
    ),
    and(
      contentFilterColumnHasOption(input.filter, CONTENT_FILTER_OPTION.VIDEOS),
      eq(input.contentType, CONTENT_TYPE.VIDEO),
      or(
        isNull(input.orientation),
        ne(input.orientation, VIDEO_ORIENTATION.VERTICAL),
      ),
    ),
    and(
      contentFilterColumnHasOption(input.filter, CONTENT_FILTER_OPTION.SHORTS),
      eq(input.contentType, CONTENT_TYPE.VIDEO),
      eq(input.orientation, VIDEO_ORIENTATION.VERTICAL),
    ),
  );
}

export function contentFilterSqlPredicate(input: {
  filter: ContentFilter;
  contentType: SqlColumn;
  orientation: SqlColumn;
}) {
  const predicates = [];
  if (hasContentFilterOption(input.filter, CONTENT_FILTER_OPTION.TEXT)) {
    predicates.push(eq(input.contentType, CONTENT_TYPE.TEXT));
  }
  if (hasContentFilterOption(input.filter, CONTENT_FILTER_OPTION.VIDEOS)) {
    predicates.push(
      and(
        eq(input.contentType, CONTENT_TYPE.VIDEO),
        or(
          isNull(input.orientation),
          ne(input.orientation, VIDEO_ORIENTATION.VERTICAL),
        ),
      ),
    );
  }
  if (hasContentFilterOption(input.filter, CONTENT_FILTER_OPTION.SHORTS)) {
    predicates.push(
      and(
        eq(input.contentType, CONTENT_TYPE.VIDEO),
        eq(input.orientation, VIDEO_ORIENTATION.VERTICAL),
      ),
    );
  }
  return or(...predicates) ?? sql`0`;
}

export function migrateLegacyViewContentType(
  contentType: "longform" | "horizontal-video" | "vertical-video" | "all",
): ContentFilter {
  switch (contentType) {
    case "longform":
      return DEFAULT_CONTENT_FILTER;
    case "horizontal-video":
      return encodeContentFilter([CONTENT_FILTER_OPTION.VIDEOS]);
    case "vertical-video":
      return encodeContentFilter([CONTENT_FILTER_OPTION.SHORTS]);
    case "all":
      return ALL_CONTENT_FILTER;
  }
}
