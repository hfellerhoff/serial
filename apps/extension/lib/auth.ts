export { EXTENSION_AUTH_REDIRECT_PATH as AUTH_REDIRECT_PATH } from "@serial/extension-identity";

export const DEFAULT_SERIAL_INSTANCE = "https://app.serial.tube";
export const AUTH_STORAGE_KEY = "serial.auth.session";
export const LAST_INSTANCE_STORAGE_KEY = "serial.auth.last-instance";
export const SELECTED_INSTANCE_STORAGE_KEY = "serial.auth.selected-instance";

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
  instance: string;
  accessToken: string;
  refreshToken: string;
  idToken?: string;
  expiresAt: number;
  endpoints: AuthEndpoints;
  user: SerialUser;
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
  return endpoints;
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
