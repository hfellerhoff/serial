import { CONTENT_CAPABILITIES } from "./capabilities";
import type {
  BookmarkContentPlatform,
  BookmarkContentType,
} from "./capabilities";

export const BOOKMARK_CAPTURE_FAILURE_REASONS = [
  "blocked_target",
  "timeout",
  "http_error",
  "not_html",
  "too_large",
  "unextractable",
  "invalid_capture",
  "unsupported_capture_version",
  "rate_limited",
  "capacity_limited",
  "unsupported_content",
] as const;

export type CaptureFailureReason =
  (typeof BOOKMARK_CAPTURE_FAILURE_REASONS)[number];

export const EXTENSION_CAPTURE_FAILURE_REASONS = [
  "too_large",
  "unextractable",
  "invalid_capture",
  "unsupported_content",
] as const satisfies readonly CaptureFailureReason[];

export type ExtensionCaptureFailureReason =
  (typeof EXTENSION_CAPTURE_FAILURE_REASONS)[number];

export const BOOKMARK_SAVE_DISPOSITIONS = [
  "created",
  "refreshed",
  "consolidated",
] as const;

export type BookmarkSaveDisposition =
  (typeof BOOKMARK_SAVE_DISPOSITIONS)[number];

export type BookmarkCaptureOutcome =
  | { status: "captured" }
  | {
      status: "preserved" | "unavailable";
      reason: CaptureFailureReason;
    };

export type BookmarkSaveResult<TBookmark> = {
  disposition: BookmarkSaveDisposition;
  bookmark: TBookmark;
  capture: BookmarkCaptureOutcome;
  removedBookmarkId?: string;
  removedBookmarkIds?: string[];
};

export type BookmarkEditorFeedback = Pick<
  BookmarkSaveResult<unknown>,
  "capture" | "disposition"
>;

export type DiscoveredFeed = {
  url: string;
  title?: string;
};

export type ExtensionBookmark = {
  id: string;
  sourceUrl: string;
  platform: BookmarkContentPlatform;
  contentType: BookmarkContentType;
  title: string;
  author: string | null;
  siteName: string | null;
  thumbnailUrl: string | null;
  iconUrl: string | null;
  captureHash: string | null;
  viewIds: number[];
  tagIds: number[];
};

export type OrganizationOption = {
  id: number;
  name: string;
};

export type ViewOrganizationOption = OrganizationOption & {
  tagIds: number[];
};

export type BookmarkWorkspace = {
  bookmark: ExtensionBookmark;
  views: ViewOrganizationOption[];
  tags: OrganizationOption[];
  feeds: DiscoveredFeed[];
  disposition: BookmarkSaveDisposition;
  capture: BookmarkCaptureOutcome;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "number");
}

function isCaptureFailureReason(value: unknown): value is CaptureFailureReason {
  return (
    typeof value === "string" &&
    (BOOKMARK_CAPTURE_FAILURE_REASONS as readonly string[]).includes(value)
  );
}

function parseBookmark(value: unknown): ExtensionBookmark | null {
  if (!isRecord(value)) return null;
  const { contentType, id, platform, sourceUrl, title, viewIds, tagIds } = value;
  if (
    typeof id !== "string" ||
    typeof sourceUrl !== "string" ||
    typeof title !== "string" ||
    typeof platform !== "string" ||
    !Object.hasOwn(CONTENT_CAPABILITIES, platform) ||
    typeof contentType !== "string" ||
    !Object.hasOwn(
      CONTENT_CAPABILITIES[platform as keyof typeof CONTENT_CAPABILITIES],
      contentType,
    ) ||
    !isNumberArray(viewIds) ||
    !isNumberArray(tagIds)
  ) {
    return null;
  }
  const nullableString = (candidate: unknown) =>
    typeof candidate === "string" ? candidate : null;
  return {
    id,
    sourceUrl,
    platform: platform as BookmarkContentPlatform,
    contentType: contentType as BookmarkContentType,
    title,
    author: nullableString(value.author),
    siteName: nullableString(value.siteName),
    thumbnailUrl: nullableString(value.thumbnailUrl),
    iconUrl: nullableString(value.iconUrl),
    captureHash: nullableString(value.captureHash),
    viewIds,
    tagIds,
  };
}

function parseCaptureOutcome(value: unknown): BookmarkCaptureOutcome | null {
  if (!isRecord(value)) return null;
  if (value.status === "captured") return { status: "captured" };
  if (
    (value.status === "preserved" || value.status === "unavailable") &&
    isCaptureFailureReason(value.reason)
  ) {
    return { status: value.status, reason: value.reason };
  }
  return null;
}

export function parseExtensionBookmark(value: unknown) {
  return parseBookmark(value);
}

export function parseExtensionBookmarkWorkspace(
  value: unknown,
  fallbackFeeds: DiscoveredFeed[],
): BookmarkWorkspace | null {
  if (!isRecord(value) || !isRecord(value.workspace)) return null;
  const bookmark = parseBookmark(value.bookmark);
  const capture = parseCaptureOutcome(value.capture);
  const disposition = value.disposition;
  if (
    !bookmark ||
    !capture ||
    typeof disposition !== "string" ||
    !(BOOKMARK_SAVE_DISPOSITIONS as readonly string[]).includes(disposition)
  ) {
    return null;
  }

  const options = (candidate: unknown): OrganizationOption[] =>
    Array.isArray(candidate)
      ? candidate.filter(
          (entry): entry is OrganizationOption =>
            isRecord(entry) &&
            typeof entry.id === "number" &&
            typeof entry.name === "string",
        )
      : [];
  const views = Array.isArray(value.workspace.views)
    ? value.workspace.views.flatMap((entry): ViewOrganizationOption[] => {
        if (
          !isRecord(entry) ||
          typeof entry.id !== "number" ||
          typeof entry.name !== "string" ||
          !isNumberArray(entry.tagIds)
        ) {
          return [];
        }
        return [{ id: entry.id, name: entry.name, tagIds: entry.tagIds }];
      })
    : [];
  const feeds = Array.isArray(value.feeds)
    ? value.feeds.flatMap((entry): DiscoveredFeed[] => {
        if (!isRecord(entry) || typeof entry.url !== "string") return [];
        return [
          {
            url: entry.url,
            ...(typeof entry.title === "string" ? { title: entry.title } : {}),
          },
        ];
      })
    : fallbackFeeds;

  return {
    bookmark,
    views,
    tags: options(value.workspace.tags),
    feeds,
    disposition: disposition as BookmarkSaveDisposition,
    capture,
  };
}
