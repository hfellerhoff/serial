import {
  EXTENSION_IDENTITY_REDIRECT_URIS,
  EXTENSION_AUTH_REDIRECT_PATH as IDENTITY_REDIRECT_PATH,
} from "@serial/extension-identity";
import { z } from "zod";

export const EXTENSION_AUTH_REDIRECT_PATH = `/${IDENTITY_REDIRECT_PATH}`;
export const EXTENSION_CONNECT_PATH = "/auth/connect-extension";

export const extensionConnectSearchSchema = z.object({
  redirect_uri: z.string(),
  state: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  code_challenge_method: z.literal("S256"),
});

export const DEFAULT_EXTENSION_REDIRECT_URIS = [
  EXTENSION_IDENTITY_REDIRECT_URIS.chrome,
  EXTENSION_IDENTITY_REDIRECT_URIS.firefox,
] as const;

const CHROMIUM_REDIRECT_HOST = /^[a-p]{32}\.chromiumapp\.org$/;
const FIREFOX_REDIRECT_HOST = /^[a-f0-9]{40}\.extensions\.allizom\.org$/;
const PKCE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const EXTENSION_BEARER_PATTERN = /^Bearer (serial_ext_[A-Za-z0-9_-]{43})$/i;
const RELATIVE_EXTENSION_CALLBACK_BASE_URL = "https://serial.invalid";

export function parseExtensionConnectCallback(value: string) {
  if (!value.startsWith(`${EXTENSION_CONNECT_PATH}?`)) return null;

  try {
    const callback = new URL(value, RELATIVE_EXTENSION_CALLBACK_BASE_URL);
    if (
      callback.origin !== RELATIVE_EXTENSION_CALLBACK_BASE_URL ||
      callback.pathname !== EXTENSION_CONNECT_PATH ||
      callback.hash
    ) {
      return null;
    }

    const search = extensionConnectSearchSchema.safeParse(
      Object.fromEntries(callback.searchParams),
    );
    if (!search.success) return null;

    return `${EXTENSION_CONNECT_PATH}?${new URLSearchParams(search.data).toString()}`;
  } catch {
    return null;
  }
}

export function getExtensionConnectCallbackFromRequestUrl(requestUrl: string) {
  try {
    const request = new URL(requestUrl);
    return parseExtensionConnectCallback(
      `${request.pathname}${request.search}`,
    );
  } catch {
    return null;
  }
}

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
