import { describe, expect, it } from "vitest";
import { sortSelectableChipOptions } from "../../../src/components/ui/selectable-chip-list";

describe("sortSelectableChipOptions", () => {
  const options = [
    { id: 1, label: "Zebra" },
    { id: 2, label: "Apple" },
    { id: 3, label: "Music" },
    { id: 4, label: "Books" },
  ];

  it("sorts all chips alphabetically without priorities", () => {
    expect(
      sortSelectableChipOptions(options, new Set()).map((o) => o.label),
    ).toEqual(["Apple", "Books", "Music", "Zebra"]);
  });

  it("sorts prioritized chips first and alphabetizes both groups", () => {
    expect(
      sortSelectableChipOptions(options, new Set([1, 3])).map((o) => o.label),
    ).toEqual(["Music", "Zebra", "Apple", "Books"]);
  });
});
