import type { BookmarkEditorFeedback } from "./bookmark-editor";

export function shouldShowBookmarkEditorFeedback(
  feedback: BookmarkEditorFeedback | undefined,
) {
  return (
    feedback !== undefined &&
    (feedback.disposition !== "created" ||
      (feedback.capture.status !== "captured" &&
        feedback.capture.reason !== "unsupported_content"))
  );
}
