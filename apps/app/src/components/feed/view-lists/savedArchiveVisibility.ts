import type { MixedContentReference } from "~/server/mixed-content/projection";
import { uniqueReferences } from "~/lib/data/mixed-content/bookmarkProjection";

export type SavedArchiveSnapshot = ReadonlyMap<string, boolean>;

export function createSavedArchiveSnapshot(
  itemIds: readonly string[],
  getIsArchived: (itemId: string) => boolean | undefined,
) {
  const snapshot = new Map<string, boolean>();
  for (const itemId of itemIds) {
    const isArchived = getIsArchived(itemId);
    if (isArchived !== undefined) snapshot.set(itemId, isArchived);
  }
  return snapshot;
}

export function mergeSavedSectionItems({
  itemIds,
  archivedReferences,
  getReference,
  isStillSaved,
}: {
  itemIds: readonly string[];
  archivedReferences: readonly MixedContentReference[];
  getReference: (itemId: string) => MixedContentReference | undefined;
  isStillSaved: (itemId: string) => boolean;
}) {
  const loadedReferences = itemIds.flatMap((itemId) => {
    const reference = getReference(itemId);
    return reference ? [reference] : [];
  });
  return uniqueReferences([
    ...loadedReferences.filter((reference) => isStillSaved(reference.entityId)),
    ...archivedReferences.filter((reference) =>
      isStillSaved(reference.entityId),
    ),
  ]).map((reference) => reference.entityId);
}

export function filterSavedSectionItems({
  itemIds,
  archivedSnapshot,
  showArchived,
}: {
  itemIds: readonly string[];
  archivedSnapshot: SavedArchiveSnapshot;
  showArchived: boolean;
}) {
  if (showArchived) return [...itemIds];
  return itemIds.filter((itemId) => archivedSnapshot.get(itemId) !== true);
}
