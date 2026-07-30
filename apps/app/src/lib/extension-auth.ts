import {
  EXTENSION_IDENTITY_REDIRECT_URIS,
  EXTENSION_AUTH_REDIRECT_PATH as IDENTITY_REDIRECT_PATH,
} from "@serial/extension-identity";

export const EXTENSION_AUTH_REDIRECT_PATH = `/${IDENTITY_REDIRECT_PATH}`;

export const DEFAULT_EXTENSION_REDIRECT_URIS = [
  EXTENSION_IDENTITY_REDIRECT_URIS.chrome,
  EXTENSION_IDENTITY_REDIRECT_URIS.firefox,
] as const;

const CHROMIUM_REDIRECT_HOST = /^[a-p]{32}\.chromiumapp\.org$/;
const FIREFOX_REDIRECT_HOST = /^[a-f0-9]{40}\.extensions\.allizom\.org$/;
const PKCE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const EXTENSION_BEARER_PATTERN = /^Bearer (serial_ext_[A-Za-z0-9_-]{43})$/i;

export function validateExtensionCodeChallenge(value: string) {
  if (!PKCE_CHALLENGE_PATTERN.test(value)) {
    throw new Error("The extension sent an invalid PKCE challenge");
  }
  return value;
}

export function readExtensionBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  return authorization?.match(EXTENSION_BEARER_PATTERN)?.[1] ?? null;
}

export function parseExtensionRedirectUri(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid Serial extension redirect URI: ${value}`);
  }

  const hasIdentityRedirectHost =
    CHROMIUM_REDIRECT_HOST.test(url.hostname) ||
    FIREFOX_REDIRECT_HOST.test(url.hostname);

  if (
    url.protocol !== "https:" ||
    !hasIdentityRedirectHost ||
    url.pathname !== EXTENSION_AUTH_REDIRECT_PATH ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(`Invalid Serial extension redirect URI: ${value}`);
  }

  return url.href;
}

export function parseExtensionRedirectUriList(value: string | undefined) {
  if (!value) return [];

  return Array.from(
    new Set(
      value
        .split(",")
        .map((uri) => uri.trim())
        .filter(Boolean)
        .map(parseExtensionRedirectUri),
    ),
  );
}
