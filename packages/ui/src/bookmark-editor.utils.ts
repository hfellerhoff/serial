import { getContentCapability } from "@serial/bookmark-capture";
import type { BookmarkContentDescriptor } from "@serial/bookmark-capture";
import type { BookmarkEditorFeedback } from "./bookmark-editor";

export const BOOKMARK_ORIGIN_FALLBACK_MESSAGE =
  "This bookmark will open in the original site.";

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
