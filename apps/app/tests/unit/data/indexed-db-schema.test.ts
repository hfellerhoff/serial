import { describe, expect, it, vi } from "vitest";
import {
  createIndexedDbSchemaGate,
  INDEXED_DB_SCHEMA_KEY,
} from "~/lib/data/indexed-db-schema";

function createMemoryStore(entries: Record<string, unknown> = {}) {
  const data = new Map<string, unknown>(Object.entries(entries));
  return {
    data,
    get: vi.fn((key: string) => Promise.resolve(data.get(key))),
    set: vi.fn((key: string, value: unknown) => {
      data.set(key, value);
      return Promise.resolve();
    }),
    clear: vi.fn(() => {
      data.clear();
      return Promise.resolve();
    }),
  };
}

describe("IndexedDB schema gate", () => {
  it.each([
    ["missing", undefined],
    ["mismatched", 1],
  ])("clears all IndexedDB data when the version is %s", async (_, version) => {
    const entries: Record<string, unknown> = {
      "serial-application-store": { legacy: true },
      "serial-feeds-store": { legacy: true },
      "serial-bookmarks-store::normalized:v1::root": { legacy: true },
    };
    if (version !== undefined) entries[INDEXED_DB_SCHEMA_KEY] = version;
    const store = createMemoryStore(entries);
    const gate = createIndexedDbSchemaGate(2, store);

    await gate.ensure();

    expect(store.clear).toHaveBeenCalledOnce();
    expect(Object.fromEntries(store.data)).toEqual({
      [INDEXED_DB_SCHEMA_KEY]: 2,
    });
  });

  it("preserves all IndexedDB data when the version matches", async () => {
    const store = createMemoryStore({
      [INDEXED_DB_SCHEMA_KEY]: 2,
      "serial-application-store": { current: true },
      "serial-feeds-store": { current: true },
    });
    const gate = createIndexedDbSchemaGate(2, store);

    await gate.ensure();

    expect(store.clear).not.toHaveBeenCalled();
    expect(Object.fromEntries(store.data)).toEqual({
      [INDEXED_DB_SCHEMA_KEY]: 2,
      "serial-application-store": { current: true },
      "serial-feeds-store": { current: true },
    });
  });

  it("serializes concurrent hydration behind one schema check", async () => {
    const store = createMemoryStore({
      [INDEXED_DB_SCHEMA_KEY]: 1,
      "serial-application-store": { legacy: true },
    });
    const gate = createIndexedDbSchemaGate(2, store);

    await Promise.all([gate.ensure(), gate.ensure(), gate.ensure()]);

    expect(store.get).toHaveBeenCalledOnce();
    expect(store.clear).toHaveBeenCalledOnce();
    expect(store.set).toHaveBeenCalledOnce();
  });

  it("runs operations directly after the schema is ready", async () => {
    const store = createMemoryStore({ [INDEXED_DB_SCHEMA_KEY]: 2 });
    const gate = createIndexedDbSchemaGate(2, store);
    await gate.ensure();
    let operationStarted = false;

    const operation = gate.run(() => {
      operationStarted = true;
      return Promise.resolve("done");
    });

    expect(operationStarted).toBe(true);
    await expect(operation).resolves.toBe("done");
  });
});
