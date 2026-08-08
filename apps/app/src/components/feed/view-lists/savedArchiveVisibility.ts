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
