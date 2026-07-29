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

export type ExtensionOAuthClientConfig = {
  name: string | null;
  redirectUris: string[];
  scopes: string[] | null;
  tokenEndpointAuthMethod: string | null;
  grantTypes: string[] | null;
  responseTypes: string[] | null;
  public: boolean | null;
  requirePKCE: boolean | null;
  skipConsent: boolean | null;
  enableEndSession: boolean | null;
};

function sameStringSet(left: string[] | null, right: string[] | null) {
  if (!left || !right || left.length !== right.length) return false;
  return right.every((value) => left.includes(value));
}

export function extensionOAuthClientNeedsUpdate(
  existing: ExtensionOAuthClientConfig,
  expected: ExtensionOAuthClientConfig,
) {
  return (
    existing.name !== expected.name ||
    !sameStringSet(existing.redirectUris, expected.redirectUris) ||
    !sameStringSet(existing.scopes, expected.scopes) ||
    existing.tokenEndpointAuthMethod !== expected.tokenEndpointAuthMethod ||
    !sameStringSet(existing.grantTypes, expected.grantTypes) ||
    !sameStringSet(existing.responseTypes, expected.responseTypes) ||
    existing.public !== expected.public ||
    existing.requirePKCE !== expected.requirePKCE ||
    existing.skipConsent !== expected.skipConsent ||
    existing.enableEndSession !== expected.enableEndSession
  );
}
