import type { VisibilityFilter } from "~/lib/data/atoms";

export type SavedSectionVisibility = "unread" | "all" | null;

export function shouldAdvanceAfterToggleRead({
  visibilityFilter,
  savedSectionVisibility,
}: {
  visibilityFilter: VisibilityFilter;
  savedSectionVisibility: SavedSectionVisibility;
}) {
  return (
    visibilityFilter === "unread" ||
    (visibilityFilter === "later" && savedSectionVisibility === "unread")
  );
}
