import { z } from "zod";

export const MAX_BULK_MUTATION_ITEMS = 1000;

export const boundedNumberIdsSchema = z
  .array(z.number())
  .max(MAX_BULK_MUTATION_ITEMS)
  .transform((ids) => [...new Set(ids)]);

export const boundedStringsSchema = z
  .array(z.string())
  .max(MAX_BULK_MUTATION_ITEMS)
  .transform((values) => [...new Set(values)]);

export function deduplicateByLastValue<T, TKey>(
  values: T[],
  getKey: (value: T) => TKey,
): T[] {
  const valuesByKey = new Map<TKey, T>();
  for (const value of values) valuesByKey.set(getKey(value), value);
  return [...valuesByKey.values()];
}
