import { env } from "~/env";
import {
  DEFAULT_EXTENSION_REDIRECT_URIS,
  parseExtensionRedirectUri,
} from "~/lib/extension-auth";

const EXTENSION_OAUTH_ENDPOINTS = new Set([
  "/api/auth/oauth2/token",
  "/api/auth/oauth2/revoke",
  "/api/auth/oauth2/userinfo",
]);

export function getAllowedExtensionRedirectUris() {
  const configuredRedirectUris = Array.isArray(
    env.SERIAL_EXTENSION_REDIRECT_URIS,
  )
    ? env.SERIAL_EXTENSION_REDIRECT_URIS
    : [];

  return Array.from(
    new Set([
      ...DEFAULT_EXTENSION_REDIRECT_URIS,
      ...configuredRedirectUris.flatMap((redirectUri) => {
        try {
          return [parseExtensionRedirectUri(redirectUri)];
        } catch {
          // Normal startup validation rejects this. Keep auth available when
          // validation is explicitly skipped by local tooling.
          return [];
        }
      }),
    ]),
  );
}

function getAllowedChromiumExtensionOrigins() {
  const chromiumRedirectSuffix = ".chromiumapp.org";
  return getAllowedExtensionRedirectUris().flatMap((redirectUri) => {
    try {
      const { hostname } = new URL(redirectUri);
      if (!hostname.endsWith(chromiumRedirectSuffix)) return [];

      const extensionId = hostname.slice(0, -chromiumRedirectSuffix.length);
      return extensionId ? [`chrome-extension://${extensionId}`] : [];
    } catch {
      return [];
    }
  });
}

function isFirefoxExtensionOrigin(origin: string) {
  try {
    const originUrl = new URL(origin);
    return (
      originUrl.protocol === "moz-extension:" &&
      Boolean(originUrl.hostname) &&
      origin === `moz-extension://${originUrl.hostname}`
    );
  } catch {
    return false;
  }
}

export function getExtensionPrepareOrigin(
  request: Request | undefined,
): string | null {
  if (!request) return null;

  const origin = request.headers.get("origin");
  if (!origin) return null;
  if (getAllowedChromiumExtensionOrigins().includes(origin)) return origin;
  return isFirefoxExtensionOrigin(origin) ? origin : null;
}

/**
 * Extension origins are trusted only for bearer/code OAuth endpoints. Firefox
 * uses a per-install moz-extension UUID, while Chromium origins are derived
 * from the configured identity redirect URIs.
 */
export function getTrustedExtensionAuthOrigin(
  request: Request | undefined,
): string | null {
  if (!request) return null;

  const origin = request.headers.get("origin");
  if (!origin) return null;

  try {
    const requestPath = new URL(request.url).pathname;
    if (!EXTENSION_OAUTH_ENDPOINTS.has(requestPath)) return null;
    if (getAllowedChromiumExtensionOrigins().includes(origin)) return origin;
    return isFirefoxExtensionOrigin(origin) ? origin : null;
  } catch {
    return null;
  }
}
