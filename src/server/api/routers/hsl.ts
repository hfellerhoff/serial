/** Parse DB format "H S% L%" into [H, S, L] numbers. Returns undefined if invalid. */
export function parseHSL(hsl: string | undefined): number[] | undefined {
  if (!hsl) return undefined;
  const parts = hsl
    .split(" ")
    .map((value) => value.replace("%", ""))
    .map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return undefined;
  return parts;
}

/** Serialize [H, S, L] numbers into DB format "H S% L%". */
export function serializeHSL(hsl: [number, number, number]): string {
  return `${hsl[0]} ${hsl[1]}% ${hsl[2]}%`;
}
