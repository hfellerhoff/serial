// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { createNormalizedIDBStorage } from "~/lib/data/normalized-idb-storage";

const indexedDb = vi.hoisted(() => ({
  entries: new Map<IDBValidKey, unknown>(),
}));

function cloneStoredValue<T>(value: T): T {
  return value === undefined ? value : structuredClone(value);
}

vi.mock("idb-keyval", () => ({
  clear: vi.fn(() => Promise.resolve(indexedDb.entries.clear())),
  del: vi.fn((key: IDBValidKey) =>
    Promise.resolve(indexedDb.entries.delete(key)),
  ),
  delMany: vi.fn((keys: IDBValidKey[]) => {
    for (const key of keys) indexedDb.entries.delete(key);
    return Promise.resolve();
  }),
  get: vi.fn((key: IDBValidKey) =>
    Promise.resolve(cloneStoredValue(indexedDb.entries.get(key))),
  ),
  getMany: vi.fn((keys: IDBValidKey[]) =>
    Promise.resolve(
      keys.map((key) => cloneStoredValue(indexedDb.entries.get(key))),
    ),
  ),
  keys: vi.fn(() => Promise.resolve([...indexedDb.entries.keys()])),
  set: vi.fn((key: IDBValidKey, value: unknown) => {
    indexedDb.entries.set(key, cloneStoredValue(value));
    return Promise.resolve();
  }),
  setMany: vi.fn((entries: Array<[IDBValidKey, unknown]>) => {
    for (const [key, value] of entries) {
      indexedDb.entries.set(key, cloneStoredValue(value));
    }
    return Promise.resolve();
  }),
}));

afterEach(() => {
  indexedDb.entries.clear();
});

describe("normalized IndexedDB in-place record updates", () => {
  it("persists a replaced entity from a stable dictionary", async () => {
    const records = { item: { id: "item", archived: false } };
    const storage = createNormalizedIDBStorage<{
      records: Record<string, { id: string; archived: boolean }>;
    }>({ recordFields: ["records"] });
    const recordKey =
      "test-store::normalized:v1::record:records:" + encodeURIComponent("item");

    storage.setItem("test-store", { state: { records } });
    window.dispatchEvent(new Event("pagehide"));
    await vi.waitFor(() =>
      expect(indexedDb.entries.get(recordKey)).toEqual({
        id: "item",
        archived: false,
      }),
    );

    records.item = { id: "item", archived: true };
    storage.setItem("test-store", { state: { records } });
    window.dispatchEvent(new Event("pagehide"));

    await vi.waitFor(() =>
      expect(indexedDb.entries.get(recordKey)).toEqual({
        id: "item",
        archived: true,
      }),
    );
  });
});
