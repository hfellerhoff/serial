import { describe, expect, it } from "vitest";
import type { PersistStorage, StorageValue } from "zustand/middleware";

import type { PersistedViewsState } from "~/lib/data/views/store";
import { viewsStoreApi } from "~/lib/data/views/store";

function createMemoryStorage() {
  const values = new Map<string, StorageValue<PersistedViewsState>>();
  const storage: PersistStorage<PersistedViewsState> = {
    getItem: (name) => values.get(name) ?? null,
    setItem: (name, value) => {
      values.set(name, value);
    },
    removeItem: (name) => {
      values.delete(name);
    },
  };
  return {
    storage,
    values,
  };
}

describe("View availability cache", () => {
  it("restores the last successful View availability with no other navigation data", async () => {
    const { storage, values } = createMemoryStorage();
    const originalStorage = viewsStoreApi.persist.getOptions().storage;
    viewsStoreApi.persist.setOptions({ storage });
    try {
      viewsStoreApi.getState().reset();
      viewsStoreApi.getState().setViewAvailability({
        1: { unread: true, read: false, later: false },
        2: { unread: false, read: true, later: true },
      });
      const persisted = values.get("serial-views-store");
      if (!persisted) throw new Error("View availability was not persisted");

      viewsStoreApi.getState().reset();
      values.set("serial-views-store", persisted);
      await viewsStoreApi.persist.rehydrate();

      expect(viewsStoreApi.getState().viewAvailability).toEqual({
        1: { unread: true, read: false, later: false },
        2: { unread: false, read: true, later: true },
      });
      expect(Object.keys(persisted.state)).not.toEqual(
        expect.arrayContaining(["tags", "feeds", "viewFeeds"]),
      );
    } finally {
      viewsStoreApi.persist.setOptions({ storage: originalStorage });
      viewsStoreApi.getState().reset();
    }
  });
});
