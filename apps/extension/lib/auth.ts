import {
  EXTENSION_OAUTH_CLIENT_ID,
  EXTENSION_OAUTH_SCOPES,
} from "@serial/extension-identity";

export { EXTENSION_AUTH_REDIRECT_PATH as AUTH_REDIRECT_PATH } from "@serial/extension-identity";

export const DEFAULT_SERIAL_INSTANCE = "https://app.serial.tube";
export const AUTH_STORAGE_KEY = "serial.auth.session";
export const LAST_INSTANCE_STORAGE_KEY = "serial.auth.last-instance";
export const SELECTED_INSTANCE_STORAGE_KEY = "serial.auth.selected-instance";
export const EXTENSION_AUTH_SESSION_VERSION = 1;
export const SERIAL_EXTENSION_CLIENT_ID = EXTENSION_OAUTH_CLIENT_ID;
export const SERIAL_EXTENSION_AUTH_SCOPES = EXTENSION_OAUTH_SCOPES;

export type SerialUser = {
  id: string;
  name?: string;
  picture?: string;
  theme?: SerialTheme;
};

export type SerialTheme = {
  lightHSL?: [number, number, number];
  darkHSL?: [number, number, number];
};

export type AuthEndpoints = {
  issuer: string;
  clientId: string;
  scopes: readonly string[];
  authorizationEndpoint: string;
  tokenEndpoint: string;
  revocationEndpoint: string;
  userInfoEndpoint: string;
  redirectUri: string;
};

export type ExtensionAuthSession = {
  version: typeof EXTENSION_AUTH_SESSION_VERSION;
  instance: string;
  accessToken: string;
  refreshToken: string;
  idToken?: string;
  expiresAt: number;
  endpoints: AuthEndpoints;
  user: SerialUser;
};

export type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
};

export type AuthMessage =
  | { type: "auth.get-session" }
  | { type: "auth.sign-in"; instance: string; interactive?: boolean }
  | { type: "auth.sign-out" };

export type AuthMessageResponse =
  | { ok: true; session: ExtensionAuthSession | null }
  | { ok: false; error: string };

export function validateAuthEndpoints(
  instance: string,
  redirectUri: string,
  endpoints: AuthEndpoints,
) {
  const issuer = new URL("/api/auth", `${instance}/`).toString();
  const expectedEndpoints = {
    issuer,
    authorizationEndpoint: `${issuer}/oauth2/authorize`,
    tokenEndpoint: `${issuer}/oauth2/token`,
    revocationEndpoint: `${issuer}/oauth2/revoke`,
    userInfoEndpoint: `${issuer}/oauth2/userinfo`,
    redirectUri,
  };

  for (const [key, expected] of Object.entries(expectedEndpoints)) {
    if (endpoints[key as keyof typeof expectedEndpoints] !== expected) {
      throw new Error(
        "The Serial instance returned unexpected authentication endpoints",
      );
    }
  }
  const hasExactClient = endpoints.clientId === SERIAL_EXTENSION_CLIENT_ID;
  const hasExactScopes =
    endpoints.scopes.length === SERIAL_EXTENSION_AUTH_SCOPES.length &&
    SERIAL_EXTENSION_AUTH_SCOPES.every(
      (scope, index) => endpoints.scopes[index] === scope,
    );
  if (!hasExactClient || !hasExactScopes) {
    throw new Error(
      "The Serial instance returned an unexpected OAuth client contract",
    );
  }
  return endpoints;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function optionalString(value: unknown): string | undefined | null {
  return value === undefined
    ? undefined
    : typeof value === "string"
      ? value
      : null;
}

function optionalNonEmptyString(value: unknown): string | undefined | null {
  return value === undefined ? undefined : requiredString(value);
}

export function parseAuthEndpoints(
  instance: string,
  redirectUri: string,
  value: unknown,
): AuthEndpoints {
  if (!isRecord(value) || !Array.isArray(value.scopes)) {
    throw new Error("The Serial instance returned invalid authentication data");
  }

  const issuer = requiredString(value.issuer);
  const clientId = requiredString(value.clientId);
  const authorizationEndpoint = requiredString(value.authorizationEndpoint);
  const tokenEndpoint = requiredString(value.tokenEndpoint);
  const revocationEndpoint = requiredString(value.revocationEndpoint);
  const userInfoEndpoint = requiredString(value.userInfoEndpoint);
  const returnedRedirectUri = requiredString(value.redirectUri);
  const scopes = value.scopes.every((scope) => typeof scope === "string")
    ? value.scopes
    : null;
  if (
    !issuer ||
    !clientId ||
    !authorizationEndpoint ||
    !tokenEndpoint ||
    !revocationEndpoint ||
    !userInfoEndpoint ||
    !returnedRedirectUri ||
    !scopes
  ) {
    throw new Error("The Serial instance returned invalid authentication data");
  }

  return validateAuthEndpoints(instance, redirectUri, {
    issuer,
    clientId,
    scopes,
    authorizationEndpoint,
    tokenEndpoint,
    revocationEndpoint,
    userInfoEndpoint,
    redirectUri: returnedRedirectUri,
  });
}

export function parseTokenResponse(value: unknown): TokenResponse {
  if (!isRecord(value)) {
    throw new Error("Serial returned an invalid token response");
  }

  const accessToken = requiredString(value.access_token);
  const refreshToken = optionalNonEmptyString(value.refresh_token);
  const idToken = optionalNonEmptyString(value.id_token);
  const expiresIn = value.expires_in;
  const hasValidExpiration =
    expiresIn === undefined ||
    (typeof expiresIn === "number" &&
      Number.isFinite(expiresIn) &&
      Number.isInteger(expiresIn) &&
      expiresIn > 0);
  if (
    !accessToken ||
    refreshToken === null ||
    idToken === null ||
    !hasValidExpiration
  ) {
    throw new Error("Serial returned an invalid token response");
  }

  return {
    access_token: accessToken,
    ...(refreshToken ? { refresh_token: refreshToken } : {}),
    ...(idToken ? { id_token: idToken } : {}),
    ...(expiresIn === undefined ? {} : { expires_in: expiresIn }),
  };
}

export function getAuthErrorDetails(value: unknown) {
  if (!isRecord(value)) return {};
  const error = optionalString(value.error);
  const errorDescription = optionalString(value.error_description);
  const code = optionalString(value.code);
  const message = optionalString(value.message);
  return {
    ...(error ? { error } : {}),
    ...(errorDescription ? { errorDescription } : {}),
    ...(code ? { code } : {}),
    ...(message ? { message } : {}),
  };
}

export async function readAuthJsonResponse(
  response: Response,
): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    throw new Error(
      `Serial returned a non-JSON response (${response.status}). Check the instance reverse-proxy configuration and compatibility.`,
      { cause: error },
    );
  }
}

export function parseSerialUser(value: unknown): SerialUser {
  if (!isRecord(value)) {
    throw new Error("Serial returned invalid account information");
  }
  const id = requiredString(value.sub);
  const name = optionalString(value.name);
  const picture = optionalString(value.picture);
  if (!id || name === null || picture === null) {
    throw new Error("Serial returned invalid account information");
  }
  const theme = parseSerialTheme(value["https://serial.tube/theme"]);
  return {
    id,
    ...(name === undefined ? {} : { name }),
    ...(picture === undefined ? {} : { picture }),
    ...(theme ? { theme } : {}),
  };
}

export function parseStoredAuthSession(
  value: unknown,
): ExtensionAuthSession | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value) || value.version !== EXTENSION_AUTH_SESSION_VERSION) {
    return null;
  }

  const instance = requiredString(value.instance);
  const accessToken = requiredString(value.accessToken);
  const refreshToken = requiredString(value.refreshToken);
  const idToken = optionalNonEmptyString(value.idToken);
  const expiresAt = value.expiresAt;
  if (
    !instance ||
    !accessToken ||
    !refreshToken ||
    idToken === null ||
    typeof expiresAt !== "number" ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= 0 ||
    !isRecord(value.endpoints)
  ) {
    return null;
  }

  try {
    if (normalizeInstanceUrl(instance) !== instance) return null;
    const redirectUri = requiredString(value.endpoints.redirectUri);
    if (!redirectUri) return null;
    const endpoints = parseAuthEndpoints(
      instance,
      redirectUri,
      value.endpoints,
    );
    const user = parseStoredSerialUser(value.user);
    if (!user) return null;
    return {
      version: EXTENSION_AUTH_SESSION_VERSION,
      instance,
      accessToken,
      refreshToken,
      ...(idToken === undefined ? {} : { idToken }),
      expiresAt,
      endpoints,
      user,
    };
  } catch {
    return null;
  }
}

function parseStoredSerialUser(value: unknown): SerialUser | null {
  if (!isRecord(value)) return null;
  const id = requiredString(value.id);
  const name = optionalString(value.name);
  const picture = optionalString(value.picture);
  if (!id || name === null || picture === null) return null;
  const theme = parseSerialTheme(value.theme);
  return {
    id,
    ...(name === undefined ? {} : { name }),
    ...(picture === undefined ? {} : { picture }),
    ...(theme ? { theme } : {}),
  };
}

export function normalizeInstanceUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Enter a Serial instance address");
  }

  const hasScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed);
  const schemelessUrl = hasScheme ? null : new URL(`http://${trimmed}`);
  const isSchemelessLocal = schemelessUrl
    ? isLoopbackHostname(schemelessUrl.hostname)
    : false;
  const withScheme = hasScheme
    ? trimmed
    : `${isSchemelessLocal ? "http" : "https"}://${trimmed}`;
  const url = new URL(withScheme);

  if (url.username || url.password) {
    throw new Error("Instance addresses cannot contain credentials");
  }

  const isLocal = isLoopbackHostname(url.hostname);
  if (url.protocol !== "https:" && !(isLocal && url.protocol === "http:")) {
    throw new Error("Serial instances must use HTTPS");
  }

  return url.origin;
}

function isLoopbackHostname(hostname: string) {
  const unwrappedHostname = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    unwrappedHostname === "localhost" ||
    unwrappedHostname === "127.0.0.1" ||
    unwrappedHostname === "::1"
  ) {
    return true;
  }
  return false;
}

export function originPermission(instance: string) {
  const url = new URL(instance);
  return `${url.protocol}//${url.hostname}/*`;
}

type ResolveInitialInstanceOptions = {
  detectedInstance: string | null;
  hasActiveWebSession: boolean;
  selectedInstance: string | null;
  lastInstance: string | null;
};

export function resolveInitialInstance({
  detectedInstance,
  hasActiveWebSession,
  selectedInstance,
  lastInstance,
}: ResolveInitialInstanceOptions) {
  if (detectedInstance) {
    return hasActiveWebSession ? detectedInstance : null;
  }
  return selectedInstance ?? lastInstance;
}

function isHslTuple(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((part) => typeof part === "number" && Number.isFinite(part))
  );
}

export function parseSerialTheme(value: unknown): SerialTheme | undefined {
  if (!value || typeof value !== "object") return undefined;

  const candidate = value as {
    lightHSL?: unknown;
    darkHSL?: unknown;
  };
  const lightHSL = isHslTuple(candidate.lightHSL)
    ? candidate.lightHSL
    : undefined;
  const darkHSL = isHslTuple(candidate.darkHSL) ? candidate.darkHSL : undefined;

  return lightHSL || darkHSL ? { lightHSL, darkHSL } : undefined;
}

export function getThemeCssVariables(theme: SerialTheme | undefined) {
  const variables: Record<string, string> = {};
  if (theme?.lightHSL) {
    variables["--light-hue"] = String(theme.lightHSL[0]);
    variables["--light-sat"] = `${theme.lightHSL[1]}%`;
    variables["--light-lgt"] = `${theme.lightHSL[2]}%`;
  }
  if (theme?.darkHSL) {
    variables["--dark-hue"] = String(theme.darkHSL[0]);
    variables["--dark-sat"] = `${theme.darkHSL[1]}%`;
    variables["--dark-lgt"] = `${theme.darkHSL[2]}%`;
  }
  return variables;
}
