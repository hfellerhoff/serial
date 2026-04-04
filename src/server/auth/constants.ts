import { env } from "~/env";

export const AUTH_SIGNED_IN_URL = "/";
export const AUTH_SIGNED_OUT_URL = "/auth/sign-in";
export const AUTH_PAGE_URL = "/auth/sign-in";
export const AUTH_RESET_PASSWORD_URL = "/auth/reset";

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
