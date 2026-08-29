import type { AuthProvider } from "~/lib/constants";
import { authProviderSchema } from "~/lib/constants";
import { getAtprotoClientMode } from "~/server/auth/atproto/mode";
import { logWarning } from "~/server/logger";
import { env } from "~/env";

const BASE_ORIGIN = new URL(env.PUBLIC_BASE_URL).origin;
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
 * Returns the matched origin, or falls back to PUBLIC_BASE_URL.
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

// Compile-enforced to cover every provider: adding one to authProviderSchema
// without an entry here is a type error.
let warnedAtprotoUnavailable = false;

/**
 * Whether AT Protocol auth is configured. Both variables are required
 * together — env validation fails startup on a partial pair — so either
 * check alone would do; requiring both keeps this true only in states the
 * atproto client can actually start from. The client mode check keeps it
 * false when the SDK would reject the metadata built from PUBLIC_BASE_URL
 * (an http non-loopback URL, say): atproto then soft-disables — no plugin,
 * no buttons — instead of rendering flows that can only fail at authorize.
 */
export function isAtprotoConfigured(): boolean {
  const hasKeys =
    !!env.ATPROTO_CLIENT_PRIVATE_KEYS && !!env.ATPROTO_STORE_ENCRYPTION_KEY;
  if (!hasKeys) return false;
  if (getAtprotoClientMode() === "unavailable") {
    if (!warnedAtprotoUnavailable) {
      warnedAtprotoUnavailable = true;
      logWarning(
        `[atproto] ATPROTO_* keys are set but PUBLIC_BASE_URL (${env.PUBLIC_BASE_URL}) cannot serve an AT Protocol client: it must be https (production), or a plain-http loopback URL for the dev loopback client. Atmosphere auth is disabled.`,
      );
    }
    return false;
  }
  return true;
}

const PROVIDER_CONFIGURED: Record<AuthProvider, () => boolean> = {
  email: () => true,
  oauth: isOAuthConfigured,
  atproto: isAtprotoConfigured,
};

/**
 * The auth providers this instance has configured (env-dependent), in
 * schema order.
 */
export function getConfiguredAuthProviders(): AuthProvider[] {
  return authProviderSchema.options.filter((p) => PROVIDER_CONFIGURED[p]());
}
