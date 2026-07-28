export type StaticFeedSearchOption = {
  label: string;
  description?: string;
  url: string;
  keywords?: string[];
};

/**
 * Curated feed shortcuts shown in the add-feed command.
 *
 * Add one entry per feed. Entries may share a keyword, so a search such as
 * "dropout" can intentionally return several related feeds. Include common
 * abbreviations and alternate spellings in `keywords` (for example,
 * "ny times" and "nytimes") so cmdk can fuzzily match them.
 */
export const STATIC_FEED_SEARCH_OPTIONS: StaticFeedSearchOption[] = [];

export function normalizeFeedSearchUrl(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;

  const hasExplicitScheme = /^https?:\/\//i.test(trimmedValue);
  const normalizedValue = hasExplicitScheme
    ? trimmedValue
    : `https://${trimmedValue}`;

  try {
    const parsedUrl = new URL(normalizedValue);
    const looksLikeHostname =
      parsedUrl.hostname.includes(".") ||
      parsedUrl.hostname === "localhost" ||
      parsedUrl.hostname.includes(":");

    return hasExplicitScheme || looksLikeHostname ? normalizedValue : null;
  } catch {
    return null;
  }
}
