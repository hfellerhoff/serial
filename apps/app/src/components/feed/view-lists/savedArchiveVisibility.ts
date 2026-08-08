export type SavedArchiveState = {
  archivedAt: Date | null;
  isArchived: boolean;
};

export type SavedArchiveSnapshot = ReadonlyMap<string, SavedArchiveState>;

export function createSavedArchiveSnapshot(
  itemIds: readonly string[],
  getArchiveState: (itemId: string) => SavedArchiveState | undefined,
) {
  const snapshot = new Map<string, SavedArchiveState>();
  for (const itemId of itemIds) {
    const archiveState = getArchiveState(itemId);
    if (archiveState !== undefined) snapshot.set(itemId, archiveState);
  }
  return snapshot;
}

export function getSoftArchivedSavedItemIds(
  archivedSnapshot: SavedArchiveSnapshot,
  contextStartedAt: number,
) {
  const softArchivedItemIds = new Set<string>();

  for (const [itemId, state] of archivedSnapshot) {
    if (
      state.isArchived &&
      state.archivedAt !== null &&
      state.archivedAt.getTime() >= contextStartedAt
    ) {
      softArchivedItemIds.add(itemId);
    }
  }

  return softArchivedItemIds;
}

export function filterSavedSectionItems({
  itemIds,
  archivedSnapshot,
  showArchived,
  softArchivedItemIds,
}: {
  itemIds: readonly string[];
  archivedSnapshot: SavedArchiveSnapshot;
  showArchived: boolean;
  softArchivedItemIds: ReadonlySet<string>;
}) {
  if (showArchived) return [...itemIds];

  return itemIds.filter(
    (itemId) =>
      archivedSnapshot.get(itemId)?.isArchived !== true ||
      softArchivedItemIds.has(itemId),
  );
}
