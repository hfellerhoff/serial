import { BOOKMARK_CAPTURE_LIMITS } from "./contracts";

export class InvalidBookmarkUrlError extends Error {}

function assertBounded(value: string) {
  if (Buffer.byteLength(value, "utf8") > BOOKMARK_CAPTURE_LIMITS.urlBytes) {
    throw new InvalidBookmarkUrlError("The URL is too large");
  }
}

export function normalizeBookmarkUrl(value: string) {
  assertBounded(value);

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new InvalidBookmarkUrlError("The URL is invalid");
  }

  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username !== "" ||
    parsed.password !== ""
  ) {
    throw new InvalidBookmarkUrlError("The URL is invalid");
  }

  parsed.hash = "";
  const normalized = parsed.toString();
  assertBounded(normalized);
  return normalized;
}

export function chooseCanonicalUrl(input: {
  sourceUrl: string;
  effectiveUrl?: string;
  canonicalUrl?: string;
}) {
  const sourceUrl = normalizeBookmarkUrl(input.sourceUrl);
  const effectiveUrl = input.effectiveUrl
    ? normalizeBookmarkUrl(input.effectiveUrl)
    : null;

  if (input.canonicalUrl && effectiveUrl) {
    try {
      const canonicalUrl = normalizeBookmarkUrl(input.canonicalUrl);
      if (new URL(canonicalUrl).origin === new URL(effectiveUrl).origin) {
        return canonicalUrl;
      }
    } catch {
      // An invalid page hint is ignored in favor of the effective URL.
    }
  }

  return effectiveUrl ?? sourceUrl;
}

export function resolveOptionalHttpUrl(
  value: string | undefined | null,
  baseUrl: string,
) {
  if (!value) return null;
  try {
    return normalizeBookmarkUrl(new URL(value, baseUrl).toString());
  } catch {
    return null;
  }
}
