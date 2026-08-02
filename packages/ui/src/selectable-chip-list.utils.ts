export type SelectableChipOption = {
  id: number;
  label: string;
};

export function sortSelectableChipOptions<T extends SelectableChipOption>(
  options: T[],
  prioritizedIds: ReadonlySet<number>,
) {
  return options.slice().sort((a, b) => {
    const priorityDifference =
      Number(prioritizedIds.has(b.id)) - Number(prioritizedIds.has(a.id));
    return priorityDifference || a.label.localeCompare(b.label);
  });
}
