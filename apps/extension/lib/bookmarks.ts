import {
  BOOKMARK_CAPTURE_LIMITS,
  EXTENSION_BOOKMARK_CONTRACT_VERSION,
} from "@serial/bookmark-capture";
import type {
  BookmarkWorkspace,
  DiscoveredFeed,
  ExtensionBookmark,
  ExtensionCaptureCandidate,
  ExtensionPageObservation,
  OrganizationOption,
  ViewOrganizationOption,
} from "@serial/bookmark-capture";

export type {
  BookmarkCaptureOutcome,
  BookmarkWorkspace,
  ExtensionBookmark,
  OrganizationOption,
  ViewOrganizationOption,
} from "@serial/bookmark-capture";

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
    feeds: observation.feeds,
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
