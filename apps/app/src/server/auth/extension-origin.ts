import { env } from "~/env";

const DEFAULT_EXTENSION_REDIRECT_URIS = [
  // Chrome: derived from the public manifest key in apps/extension/wxt.config.ts.
  "https://abfgpdgoffipbnfjcdoejalehhbegamc.chromiumapp.org/serial-auth",
  // Firefox: SHA-1 of the explicit Gecko ID, extension@serial.tube.
  "https://316a919b8777a95fa74b9564f4685cbe813b1a1d.extensions.allizom.org/serial-auth",
];

const EXTENSION_OAUTH_ENDPOINTS = new Set([
  "/api/auth/oauth2/token",
  "/api/auth/oauth2/revoke",
  "/api/auth/oauth2/userinfo",
]);

export function getAllowedExtensionRedirectUris() {
  return Array.from(
    new Set([
      ...DEFAULT_EXTENSION_REDIRECT_URIS,
      ...(env.SERIAL_EXTENSION_REDIRECT_URIS ?? []),
    ]),
  );
}

function getAllowedChromiumExtensionOrigins() {
  const chromiumRedirectSuffix = ".chromiumapp.org";
  return getAllowedExtensionRedirectUris().flatMap((redirectUri) => {
    const { hostname } = new URL(redirectUri);
    if (!hostname.endsWith(chromiumRedirectSuffix)) return [];

    const extensionId = hostname.slice(0, -chromiumRedirectSuffix.length);
    return extensionId ? [`chrome-extension://${extensionId}`] : [];
  });
}

/**
 * Chromium extension origins are stable and allowlisted exactly. Firefox uses
 * a per-install moz-extension UUID, so only its bearer/code OAuth endpoints
 * accept that scheme; core cookie-backed auth routes remain untrusted.
 */
export function getTrustedExtensionAuthOrigin(
  request: Request | undefined,
): string | null {
  if (!request) return null;

  const origin = request.headers.get("origin");
  if (!origin) return null;
  if (getAllowedChromiumExtensionOrigins().includes(origin)) return origin;

  try {
    const originUrl = new URL(origin);
    const requestPath = new URL(request.url).pathname;
    const isFirefoxExtension =
      originUrl.protocol === "moz-extension:" &&
      Boolean(originUrl.hostname) &&
      origin === `moz-extension://${originUrl.hostname}`;
    return isFirefoxExtension && EXTENSION_OAUTH_ENDPOINTS.has(requestPath)
      ? origin
      : null;
  } catch {
    return null;
  }
}
