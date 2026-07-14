import { env } from "~/env";

const BASE_ORIGIN = new URL(env.VITE_PUBLIC_BASE_URL).origin;
export const TRUSTED_ORIGINS_SET = new Set([
  BASE_ORIGIN,
  ...env.TRUSTED_ORIGINS.map((o) => new URL(o).origin),
]);

/**
 * Whether an origin may make credentialed CORS requests to the auth API.
 * Trusts the explicit TRUSTED_ORIGINS list, plus any https origin on the
 * shared cookie domain — those hosts already receive the session cookie,
 * so allowing them CORS grants nothing new.
 */
export function isTrustedCorsOrigin(origin: string): boolean {
  if (TRUSTED_ORIGINS_SET.has(origin)) return true;
  if (!env.COOKIE_DOMAIN) return false;

  try {
    const { protocol, hostname } = new URL(origin);
    if (protocol !== "https:") return false;
    const cookieDomain = env.COOKIE_DOMAIN.replace(/^\./, "");
    const isOnCookieDomain =
      hostname === cookieDomain || hostname.endsWith(`.${cookieDomain}`);
    return isOnCookieDomain;
  } catch {
    return false;
  }
}

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
