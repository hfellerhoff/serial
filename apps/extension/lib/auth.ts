export { EXTENSION_AUTH_REDIRECT_PATH as AUTH_REDIRECT_PATH } from "@serial/extension-identity";

export const DEFAULT_SERIAL_INSTANCE = "https://app.serial.tube";
export const AUTH_STORAGE_KEY = "serial.auth.session";
export const LAST_INSTANCE_STORAGE_KEY = "serial.auth.last-instance";
export const SELECTED_INSTANCE_STORAGE_KEY = "serial.auth.selected-instance";
export const EXTENSION_AUTH_SESSION_VERSION = 2;

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

export type ExtensionAuthSession = {
  version: typeof EXTENSION_AUTH_SESSION_VERSION;
  instance: string;
  token: string;
  expiresAt: number;
  user: SerialUser;
};

export function isSessionExpired(
  session: ExtensionAuthSession,
  now = Date.now(),
) {
  return session.expiresAt <= now;
}

export type AuthMessage =
  | { type: "auth.get-session" }
  | { type: "auth.sign-in"; instance: string }
  | { type: "auth.sign-out" };

export type AuthMessageResponse =
  | { ok: true; session: ExtensionAuthSession | null }
  | { ok: false; error: string };

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

export function getAuthErrorMessage(value: unknown) {
  if (!isRecord(value)) return null;
  return requiredString(value.error) ?? requiredString(value.message);
}

export async function readAuthJsonResponse(response: Response) {
  try {
    return (await response.json()) as unknown;
  } catch (error) {
    throw new Error(
      `Serial returned a non-JSON response (${response.status}). Check that this is a compatible Serial instance.`,
      { cause: error },
    );
  }
}

function parseSerialUser(value: unknown): SerialUser | null {
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

function parseSessionPayload(value: unknown) {
  if (!isRecord(value)) return null;
  const expiresAt = value.expiresAt;
  const user = parseSerialUser(value.user);
  if (
    typeof expiresAt !== "number" ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= 0 ||
    !user
  ) {
    return null;
  }
  return { expiresAt, user };
}

export function parseConnectionResponse(
  instance: string,
  value: unknown,
): ExtensionAuthSession {
  if (!isRecord(value)) {
    throw new Error("Serial returned an invalid connection response");
  }
  const token = requiredString(value.token);
  const payload = parseSessionPayload(value);
  if (!token || !payload) {
    throw new Error("Serial returned an invalid connection response");
  }
  return {
    version: EXTENSION_AUTH_SESSION_VERSION,
    instance,
    token,
    ...payload,
  };
}

export function updateSessionFromResponse(
  session: ExtensionAuthSession,
  value: unknown,
) {
  const payload = parseSessionPayload(value);
  if (!payload) {
    throw new Error("Serial returned invalid account information");
  }
  return { ...session, ...payload };
}

export function parseStoredAuthSession(
  value: unknown,
): ExtensionAuthSession | null {
  if (!isRecord(value) || value.version !== EXTENSION_AUTH_SESSION_VERSION) {
    return null;
  }
  const instance = requiredString(value.instance);
  const token = requiredString(value.token);
  const payload = parseSessionPayload(value);
  if (!instance || !token || !payload) return null;
  try {
    if (normalizeInstanceUrl(instance) !== instance) return null;
  } catch {
    return null;
  }
  return {
    version: EXTENSION_AUTH_SESSION_VERSION,
    instance,
    token,
    ...payload,
  };
}

type NormalizeInstanceUrlOptions = {
  allowHttpLoopback?: boolean;
};

export function normalizeInstanceUrl(
  value: string,
  {
    allowHttpLoopback = import.meta.env.MODE !== "production",
  }: NormalizeInstanceUrlOptions = {},
): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Enter a Serial instance address");

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
  if (
    url.protocol !== "https:" &&
    !(allowHttpLoopback && isLocal && url.protocol === "http:")
  ) {
    throw new Error("Serial instances must use HTTPS");
  }
  return url.origin;
}

function isLoopbackHostname(hostname: string) {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1"
  );
}

export function originPermission(instance: string) {
  const url = new URL(instance);
  return `${url.protocol}//${url.hostname}/*`;
}

type ResolveInitialInstanceOptions = {
  detectedInstance: string | null;
  selectedInstance: string | null;
  lastInstance: string | null;
};

export function resolveInitialInstance({
  detectedInstance,
  selectedInstance,
  lastInstance,
}: ResolveInitialInstanceOptions) {
  return detectedInstance ?? selectedInstance ?? lastInstance;
}

function isHslTuple(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((part) => typeof part === "number" && Number.isFinite(part))
  );
}

export function parseSerialTheme(value: unknown): SerialTheme | undefined {
  if (!isRecord(value)) return undefined;
  const lightHSL = isHslTuple(value.lightHSL) ? value.lightHSL : undefined;
  const darkHSL = isHslTuple(value.darkHSL) ? value.darkHSL : undefined;
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
