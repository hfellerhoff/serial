import { ZodSchema } from "zod";

export function parseArrayOfSchema<TSchema extends ZodSchema>(
  array: unknown[],
  schema: TSchema,
) {
  return array
    .map((item) => {
      try {
        return schema.parse(item);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}
