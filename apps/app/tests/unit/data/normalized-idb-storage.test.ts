import { describe, expect, it } from "vitest";
import {
  NORMALIZED_ARRAY_CHUNK_SIZE,
  planNormalizedArrayChunkChanges,
  planNormalizedRecordChanges,
} from "~/lib/data/normalized-idb-storage";

describe("normalized IndexedDB persistence", () => {
  it("plans one record write for one entity mutation in a stress-sized cache", () => {
    const previous = Object.fromEntries(
      Array.from({ length: 50_000 }, (_, index) => [
        `entity-${index}`,
        { id: `entity-${index}`, progress: 0 },
      ]),
    );
    const next = {
      ...previous,
      "entity-25": { id: "entity-25", progress: 1 },
    };

    expect(planNormalizedRecordChanges(previous, next)).toEqual({
      upsertIds: ["entity-25"],
      deleteIds: [],
    });
  });

  it("writes no order chunks when an entity mutation preserves ordering", () => {
    const previous = Array.from(
      { length: NORMALIZED_ARRAY_CHUNK_SIZE * 20 },
      (_, index) => `entity-${index}`,
    );

    expect(planNormalizedArrayChunkChanges(previous, previous)).toEqual({
      upsertChunkIndexes: [],
      deleteChunkIndexes: [],
    });
  });

  it("limits an append to the final order chunk", () => {
    const previous = Array.from(
      { length: NORMALIZED_ARRAY_CHUNK_SIZE + 10 },
      (_, index) => `entity-${index}`,
    );
    const next = [...previous, "new-entity"];

    expect(planNormalizedArrayChunkChanges(previous, next)).toEqual({
      upsertChunkIndexes: [1],
      deleteChunkIndexes: [],
    });
  });
});
