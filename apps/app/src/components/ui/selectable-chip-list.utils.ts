type SortableChipOption = {
  id: number;
  label: string;
};

export function sortSelectableChipOptions<T extends SortableChipOption>(
  options: T[],
  prioritizedIds: ReadonlySet<number>,
) {
  return [...options].sort((a, b) => {
    const priorityDifference =
      Number(prioritizedIds.has(b.id)) - Number(prioritizedIds.has(a.id));
    return priorityDifference || a.label.localeCompare(b.label);
  });
}
