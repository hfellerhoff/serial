import { clear, get, set } from "idb-keyval";

export const INDEXED_DB_SCHEMA_KEY = "serial-indexed-db-schema-version";
export const INDEXED_DB_SCHEMA_VERSION = 2;

type IndexedDbSchemaStore = {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown) => Promise<unknown>;
  clear: () => Promise<unknown>;
};

/**
 * Creates a one-shot gate that every IndexedDB-backed store passes through
 * before reading or writing. Once initialized, operations take a synchronous
 * fast path into their own IndexedDB transaction. A cache schema change
 * invalidates the complete shared idb-keyval database so independently
 * persisted stores cannot hydrate a mix of compatible and incompatible state.
 */
export function createIndexedDbSchemaGate(
  currentVersion: number,
  store: IndexedDbSchemaStore,
) {
  let initialization: Promise<void> | undefined;
  let ready = false;

  const ensure = () => {
    initialization ??= (async () => {
      const storedVersion = await store.get(INDEXED_DB_SCHEMA_KEY);
      if (storedVersion !== currentVersion) {
        await store.clear();
        await store.set(INDEXED_DB_SCHEMA_KEY, currentVersion);
      }
      ready = true;
    })();
    return initialization;
  };

  return {
    ensure,
    run: <T>(operation: () => Promise<T>) =>
      ready ? operation() : ensure().then(operation),
  };
}

const currentIndexedDbSchema = createIndexedDbSchemaGate(
  INDEXED_DB_SCHEMA_VERSION,
  { get, set, clear },
);

export const ensureCurrentIndexedDbSchema = currentIndexedDbSchema.ensure;
export const withCurrentIndexedDbSchema = currentIndexedDbSchema.run;
