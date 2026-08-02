import { getContentCapability } from "@serial/bookmark-capture";
import type {
  BookmarkContentDescriptor,
  BookmarkEditorFeedback,
} from "@serial/bookmark-capture";

export const BOOKMARK_ORIGIN_FALLBACK_MESSAGE =
  "This bookmark will open in the original site.";

const CAPTURE_FAILURE_MESSAGES: Record<
  Exclude<BookmarkEditorFeedback["capture"], { status: "captured" }>["reason"],
  string
> = {
  blocked_target: "This address cannot be captured safely.",
  timeout: "The page took too long to capture.",
  http_error: "The page did not return usable content.",
  not_html: "The address did not return a web page.",
  too_large: "The page was too large to capture.",
  unextractable: "Serial could not extract reader-oriented content.",
  invalid_capture: "The extracted page did not pass Serial’s safety checks.",
  unsupported_capture_version: "This capture format is not supported.",
  rate_limited: "Capture is temporarily rate limited.",
  capacity_limited: "Capture capacity is temporarily unavailable.",
  unsupported_content: BOOKMARK_ORIGIN_FALLBACK_MESSAGE,
};

export type BookmarkEditorFeedbackPresentation = {
  icon: "refresh" | "origin" | "info";
  message: string;
};

export function getBookmarkEditorFeedbackPresentation(
  feedback: BookmarkEditorFeedback,
): BookmarkEditorFeedbackPresentation {
  if (feedback.capture.status === "captured") {
    return {
      icon: "refresh",
      message:
        "Existing Bookmark refreshed. Its Views and Tags were preserved.",
    };
  }
  if (feedback.capture.reason === "unsupported_content") {
    return { icon: "origin", message: BOOKMARK_ORIGIN_FALLBACK_MESSAGE };
  }
  const preserved = feedback.capture.status === "preserved";
  return {
    icon: "info",
    message: `${CAPTURE_FAILURE_MESSAGES[feedback.capture.reason]} ${
      preserved
        ? "The previous Page capture is still available."
        : "This Bookmark will open the original page."
    }`,
  };
}

export function shouldShowBookmarkEditorFeedback(
  feedback: BookmarkEditorFeedback | undefined,
  descriptor: BookmarkContentDescriptor,
) {
  if (
    feedback?.capture.status !== "captured" &&
    feedback?.capture.reason === "unsupported_content" &&
    getContentCapability(descriptor).nativeOpening === "player"
  ) {
    return false;
  }
  return (
    feedback !== undefined &&
    (feedback.disposition !== "created" ||
      feedback.capture.status !== "captured")
  );
}
