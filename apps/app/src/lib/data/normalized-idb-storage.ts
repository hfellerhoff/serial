import {
  clear,
  del,
  delMany,
  get,
  getMany,
  keys,
  set,
  setMany,
} from "idb-keyval";
import { withCurrentIndexedDbSchema } from "./indexed-db-schema";
import type { PersistStorage, StorageValue } from "zustand/middleware";

const WRITE_THROTTLE_MS = 2_000;
export const NORMALIZED_WRITE_BATCH_SIZE = 100;
export const NORMALIZED_ARRAY_CHUNK_SIZE = 250;

type NormalizedStorageOptions = {
  recordFields?: string[];
  arrayFields?: string[];
};

type NormalizedRoot = {
  version?: number;
  state: Record<string, unknown>;
  arrayLengths: Record<string, number>;
};

function normalizedPrefix(name: string) {
  return `${name}::normalized:v1`;
}

function rootKey(name: string) {
  return `${normalizedPrefix(name)}::root`;
}

function recordPrefix(name: string, field: string) {
  return `${normalizedPrefix(name)}::record:${field}:`;
}

function recordKey(name: string, field: string, id: string) {
  return `${recordPrefix(name, field)}${encodeURIComponent(id)}`;
}

function arrayPrefix(name: string, field: string) {
  return `${normalizedPrefix(name)}::array:${field}:`;
}

function arrayKey(name: string, field: string, index: number) {
  return `${arrayPrefix(name, field)}${index}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stateRecord<T>(
  value: StorageValue<T> | null,
): Record<string, unknown> {
  return isRecord(value?.state) ? value.state : {};
}

function sameArrayChunk(previous: unknown[], next: unknown[], start: number) {
  const end = Math.min(start + NORMALIZED_ARRAY_CHUNK_SIZE, next.length);
  if (Math.min(start + NORMALIZED_ARRAY_CHUNK_SIZE, previous.length) !== end) {
    return false;
  }
  for (let index = start; index < end; index++) {
    if (!Object.is(previous[index], next[index])) return false;
  }
  return true;
}

function sameRootState(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
) {
  const fieldNames = new Set([...Object.keys(previous), ...Object.keys(next)]);
  for (const key of fieldNames) {
    if (!Object.is(previous[key], next[key])) return false;
  }
  return true;
}

export function planNormalizedRecordChanges(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
) {
  const upsertIds = Object.entries(next).flatMap(([id, value]) =>
    Object.is(previous[id], value) ? [] : [id],
  );
  const deleteIds = Object.keys(previous).filter((id) => !(id in next));
  return { upsertIds, deleteIds };
}

export function planNormalizedArrayChunkChanges(
  previous: unknown[],
  next: unknown[],
) {
  const nextChunkCount = Math.ceil(next.length / NORMALIZED_ARRAY_CHUNK_SIZE);
  const previousChunkCount = Math.ceil(
    previous.length / NORMALIZED_ARRAY_CHUNK_SIZE,
  );
  const upsertChunkIndexes = Array.from(
    { length: nextChunkCount },
    (_, index) => index,
  ).filter(
    (index) =>
      !sameArrayChunk(previous, next, index * NORMALIZED_ARRAY_CHUNK_SIZE),
  );
  const deleteChunkIndexes = Array.from(
    { length: Math.max(0, previousChunkCount - nextChunkCount) },
    (_, index) => nextChunkCount + index,
  );
  return { upsertChunkIndexes, deleteChunkIndexes };
}

async function writeInBatches(entries: Array<[IDBValidKey, unknown]>) {
  for (
    let index = 0;
    index < entries.length;
    index += NORMALIZED_WRITE_BATCH_SIZE
  ) {
    // Keep IndexedDB transactions sequential so a cold cache cannot enqueue
    // hundreds of entity batches at once.
    // react-doctor-disable-next-line react-doctor/async-await-in-loop
    await setMany(entries.slice(index, index + NORMALIZED_WRITE_BATCH_SIZE));
  }
}

async function deleteInBatches(entries: IDBValidKey[]) {
  for (
    let index = 0;
    index < entries.length;
    index += NORMALIZED_WRITE_BATCH_SIZE
  ) {
    // Deletion batches share the same bounded transaction budget as writes.
    // react-doctor-disable-next-line react-doctor/async-await-in-loop
    await delMany(entries.slice(index, index + NORMALIZED_WRITE_BATCH_SIZE));
  }
}

async function readNormalized<T>(
  name: string,
  options: NormalizedStorageOptions,
): Promise<StorageValue<T> | null> {
  const root = await get<NormalizedRoot>(rootKey(name));
  if (!root) return null;

  const state = { ...root.state };
  const databaseKeys = await keys<IDBValidKey>();

  for (const field of options.recordFields ?? []) {
    const prefix = recordPrefix(name, field);
    const entityKeys = databaseKeys.filter(
      (key): key is string => typeof key === "string" && key.startsWith(prefix),
    );
    const record: Record<string, unknown> = {};
    for (
      let index = 0;
      index < entityKeys.length;
      index += NORMALIZED_WRITE_BATCH_SIZE
    ) {
      const keyBatch = entityKeys.slice(
        index,
        index + NORMALIZED_WRITE_BATCH_SIZE,
      );
      // Hydrate sequentially to cap the number of records simultaneously
      // materialized on the main thread.
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      const values = await getMany(keyBatch);
      for (const [valueIndex, value] of values.entries()) {
        if (value === undefined) continue;
        const key = keyBatch[valueIndex]!;
        record[decodeURIComponent(key.slice(prefix.length))] = value;
      }
    }
    state[field] = record;
  }

  for (const field of options.arrayFields ?? []) {
    const length = root.arrayLengths[field] ?? 0;
    const chunkCount = Math.ceil(length / NORMALIZED_ARRAY_CHUNK_SIZE);
    // Stores currently configure at most one ordered array; keep this await at
    // the field boundary so future arrays cannot amplify hydration memory.
    // react-doctor-disable-next-line react-doctor/async-await-in-loop
    const chunks = await getMany<unknown[]>(
      Array.from({ length: chunkCount }, (_, index) =>
        arrayKey(name, field, index),
      ),
    );
    state[field] = chunks.flatMap((chunk) => chunk ?? []).slice(0, length);
  }

  return { state: state as T, version: root.version };
}

async function writeNormalized<T>(input: {
  name: string;
  previous: StorageValue<T> | null;
  next: StorageValue<T>;
  options: NormalizedStorageOptions;
}) {
  const { name, previous, next, options } = input;
  const previousState = stateRecord(previous);
  const nextState = stateRecord(next);
  const recordFields = new Set(options.recordFields ?? []);
  const arrayFields = new Set(options.arrayFields ?? []);

  for (const field of recordFields) {
    const previousRecord = isRecord(previousState[field])
      ? previousState[field]
      : {};
    const nextRecord = isRecord(nextState[field]) ? nextState[field] : {};
    const changes = planNormalizedRecordChanges(previousRecord, nextRecord);
    const upserts: Array<[IDBValidKey, unknown]> = changes.upsertIds.map(
      (id) => [recordKey(name, field, id), nextRecord[id]],
    );
    const deletions = changes.deleteIds.map((id) => recordKey(name, field, id));
    // Each record collection is drained before the next one to preserve the
    // storage transaction budget.
    // react-doctor-disable-next-line react-doctor/async-await-in-loop
    await writeInBatches(upserts);
    await deleteInBatches(deletions);
  }

  const arrayLengths: Record<string, number> = {};
  for (const field of arrayFields) {
    const previousArray = Array.isArray(previousState[field])
      ? previousState[field]
      : [];
    const nextArray = Array.isArray(nextState[field]) ? nextState[field] : [];
    arrayLengths[field] = nextArray.length;
    const changes = planNormalizedArrayChunkChanges(previousArray, nextArray);
    const changedChunks: Array<[IDBValidKey, unknown]> = [];
    for (const index of changes.upsertChunkIndexes) {
      const start = index * NORMALIZED_ARRAY_CHUNK_SIZE;
      changedChunks.push([
        arrayKey(name, field, index),
        nextArray.slice(start, start + NORMALIZED_ARRAY_CHUNK_SIZE),
      ]);
    }
    await writeInBatches(changedChunks);
    await deleteInBatches(
      changes.deleteChunkIndexes.map((index) => arrayKey(name, field, index)),
    );
  }

  const rootState = Object.fromEntries(
    Object.entries(nextState).filter(
      ([field]) => !recordFields.has(field) && !arrayFields.has(field),
    ),
  );
  const previousRootState = Object.fromEntries(
    Object.entries(previousState).filter(
      ([field]) => !recordFields.has(field) && !arrayFields.has(field),
    ),
  );
  const rootChanged =
    previous?.version !== next.version ||
    !sameRootState(previousRootState, rootState) ||
    [...arrayFields].some(
      (field) =>
        (Array.isArray(previousState[field])
          ? previousState[field].length
          : 0) !== arrayLengths[field],
    );
  if (rootChanged || previous === null) {
    await set(rootKey(name), {
      state: rootState,
      version: next.version,
      arrayLengths,
    } satisfies NormalizedRoot);
  }
}

/**
 * Zustand storage that keeps large dictionaries as individual IndexedDB
 * records and ordered arrays in fixed-size chunks. A one-entity mutation can
 * therefore write one entity instead of structured-cloning the whole cache.
 */
export function createNormalizedIDBStorage<T>(
  options: NormalizedStorageOptions,
): PersistStorage<T> {
  if (typeof window === "undefined") {
    return {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
  }

  let lastValue: StorageValue<T> | null = null;
  let pending: { name: string; value: StorageValue<T> } | null = null;
  let writeTimeout: ReturnType<typeof setTimeout> | null = null;
  let writeChain = Promise.resolve();

  const reportWriteError = (name: string, error: unknown) => {
    const isDOMException = error instanceof DOMException;
    const shouldClear =
      isDOMException &&
      (error.name === "QuotaExceededError" ||
        error.name === "InvalidStateError");
    if (shouldClear) {
      console.warn(
        `[normalized-idb-storage] ${error.name} writing "${name}" — clearing cached data`,
      );
      void clear();
    } else {
      console.warn("[normalized-idb-storage] write failed:", name, error);
    }
  };

  const flush = () => {
    writeTimeout = null;
    const current = pending;
    pending = null;
    if (!current) return;
    writeChain = writeChain
      .then(() =>
        withCurrentIndexedDbSchema(async () => {
          await writeNormalized({
            name: current.name,
            previous: lastValue,
            next: current.value,
            options,
          });
          lastValue = current.value;
        }),
      )
      .catch((error: unknown) => reportWriteError(current.name, error));
  };

  const flushPending = () => {
    if (writeTimeout !== null) clearTimeout(writeTimeout);
    flush();
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPending();
  });
  window.addEventListener("pagehide", flushPending);

  return {
    getItem: (name) =>
      withCurrentIndexedDbSchema(async () => {
        const normalized = await readNormalized<T>(name, options);
        if (normalized) {
          lastValue = normalized;
          return normalized;
        }

        const legacy = (await get<StorageValue<T>>(name)) ?? null;
        if (legacy) {
          await writeNormalized({
            name,
            previous: null,
            next: legacy,
            options,
          });
          await del(name);
          lastValue = legacy;
        }
        return legacy;
      }),
    setItem: (name, value) => {
      pending = { name, value };
      if (writeTimeout === null) {
        writeTimeout = setTimeout(flush, WRITE_THROTTLE_MS);
      }
    },
    removeItem: async (name) => {
      if (writeTimeout !== null) clearTimeout(writeTimeout);
      writeTimeout = null;
      pending = null;
      lastValue = null;
      await withCurrentIndexedDbSchema(async () => {
        const prefix = normalizedPrefix(name);
        const matchingKeys = (await keys<IDBValidKey>()).filter(
          (key) => typeof key === "string" && key.startsWith(prefix),
        );
        await deleteInBatches(matchingKeys);
        await del(name);
      });
    },
  };
}
