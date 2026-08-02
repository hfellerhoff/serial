import {
  BOOKMARK_CAPTURE_LIMITS,
  EXTENSION_BOOKMARK_CONTRACT_VERSION,
} from "@serial/bookmark-capture";
import type {
  BookmarkContentPlatform,
  BookmarkContentType,
  DiscoveredFeed,
  ExtensionCaptureCandidate,
  ExtensionPageObservation,
} from "@serial/bookmark-capture";

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

export type BookmarkCaptureOutcome =
  | { status: "captured" }
  | {
      status: "preserved" | "unavailable";
      reason:
        | "blocked_target"
        | "timeout"
        | "http_error"
        | "not_html"
        | "too_large"
        | "unextractable"
        | "invalid_capture"
        | "unsupported_capture_version"
        | "rate_limited"
        | "capacity_limited"
        | "unsupported_content";
    };

export type BookmarkWorkspace = {
  bookmark: ExtensionBookmark;
  views: ViewOrganizationOption[];
  tags: OrganizationOption[];
  feeds: DiscoveredFeed[];
  disposition: "created" | "refreshed" | "consolidated";
  capture: BookmarkCaptureOutcome;
};

export type BookmarkMessage =
  | { type: "bookmark.capture-active" }
  | {
      type: "bookmark.set-view";
      bookmarkId: string;
      viewId: number;
      assigned: boolean;
    }
  | {
      type: "bookmark.set-tag";
      bookmarkId: string;
      tagId: number;
      assigned: boolean;
    }
  | { type: "bookmark.remove"; bookmarkId: string }
  | { type: "bookmark.add-feed"; url: string }
  | { type: "bookmark.create-view"; bookmarkId: string; name: string }
  | { type: "bookmark.create-tag"; bookmarkId: string; name: string };

export type BookmarkMessageResponse =
  | { ok: true; status: "base" | "ineligible" }
  | { ok: true; status: "removed" | "feed-added" }
  | { ok: true; status: "saved"; workspace: BookmarkWorkspace }
  | { ok: true; status: "updated"; bookmark: ExtensionBookmark }
  | {
      ok: true;
      status: "created-organization";
      bookmark: ExtensionBookmark;
      kind: "view";
      option: ViewOrganizationOption;
    }
  | {
      ok: true;
      status: "created-organization";
      bookmark: ExtensionBookmark;
      kind: "tag";
      option: OrganizationOption;
    }
  | { ok: false; authExpired: boolean; error: string };

export function isBookmarkMessage(value: unknown): value is BookmarkMessage {
  if (!value || typeof value !== "object") return false;
  const type = (value as { type?: unknown }).type;
  return typeof type === "string" && type.startsWith("bookmark.");
}

export function serializeBookmarkRequest(
  observation: ExtensionPageObservation,
) {
  const body = {
    contractVersion: EXTENSION_BOOKMARK_CONTRACT_VERSION,
    sourceUrl: observation.sourceUrl,
    capture: observation.capture,
    ...(observation.captureFailureReason
      ? { captureFailureReason: observation.captureFailureReason }
      : {}),
  };
  let serialized = JSON.stringify(body);
  let degraded = false;
  if (
    new TextEncoder().encode(serialized).byteLength >
    BOOKMARK_CAPTURE_LIMITS.extensionRequestBytes
  ) {
    const preview: ExtensionCaptureCandidate = { ...observation.capture };
    delete preview.contentHtml;
    delete preview.extractorVersion;
    delete preview.sanitizerPolicyVersion;
    serialized = JSON.stringify({
      ...body,
      capture: preview,
      captureFailureReason: "too_large",
    });
    degraded = true;
  }
  return { serialized, degraded };
}
