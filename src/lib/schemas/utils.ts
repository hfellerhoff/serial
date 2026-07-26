import type { ZodSchema } from "zod";

export function parseArrayOfSchema<TSchema extends ZodSchema>(
  array: unknown[],
  schema: TSchema,
) {
  return array.flatMap((item) => {
    try {
      return [schema.parse(item)];
    } catch {
      return [];
    }
  });
}
