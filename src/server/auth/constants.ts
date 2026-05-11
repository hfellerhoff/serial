import { env } from "~/env";

const BASE_ORIGIN = new URL(env.VITE_PUBLIC_BASE_URL).origin;
export const TRUSTED_ORIGINS_SET = new Set([
  BASE_ORIGIN,
  ...env.TRUSTED_ORIGINS.map((o) => new URL(o).origin),
]);

/**
 * Validate an incoming origin/referer against the trusted origins list.
 * Returns the matched origin, or falls back to VITE_PUBLIC_BASE_URL.
 */
export function getValidatedOrigin(headers: Headers): string {
  const origin = headers.get("origin") ?? headers.get("referer");

  if (origin) {
    try {
      const parsed = new URL(origin);
      if (TRUSTED_ORIGINS_SET.has(parsed.origin)) {
        return parsed.origin;
      }
    } catch {
      // invalid URL, fall through
    }
  }
  return BASE_ORIGIN;
}

/**
 * Whether OAuth env vars are fully configured.
 */
export function isOAuthConfigured(): boolean {
  const providerId = env.OAUTH_PROVIDER_ID;
  const clientId = env.OAUTH_CLIENT_ID;
  const clientSecret = env.OAUTH_CLIENT_SECRET;
  const hasDiscovery = !!env.OAUTH_DISCOVERY_URL;
  const hasManualUrls = !!env.OAUTH_AUTHORIZATION_URL && !!env.OAUTH_TOKEN_URL;

  return (
    !!providerId &&
    !!clientId &&
    !!clientSecret &&
    (hasDiscovery || hasManualUrls)
  );
}
