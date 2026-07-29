export const DEFAULT_SERIAL_INSTANCE = "https://app.serial.tube";
export const AUTH_STORAGE_KEY = "serial.auth.session";
export const LAST_INSTANCE_STORAGE_KEY = "serial.auth.last-instance";
export const SELECTED_INSTANCE_STORAGE_KEY = "serial.auth.selected-instance";
export const AUTH_REDIRECT_PATH = "serial-auth";

export type SerialUser = {
  id: string;
  name?: string;
  picture?: string;
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
  | { type: "auth.sign-in"; instance: string }
  | { type: "auth.sign-out" };

export type AuthMessageResponse =
  | { ok: true; session: ExtensionAuthSession | null }
  | { ok: false; error: string };

export function normalizeInstanceUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Enter a Serial instance address");
  }

  const hasScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed);
  const schemelessUrl = hasScheme ? null : new URL(`http://${trimmed}`);
  const isSchemelessLocal =
    schemelessUrl?.hostname === "localhost" ||
    schemelessUrl?.hostname === "127.0.0.1";
  const withScheme = hasScheme
    ? trimmed
    : `${isSchemelessLocal ? "http" : "https"}://${trimmed}`;
  const url = new URL(withScheme);

  if (url.username || url.password) {
    throw new Error("Instance addresses cannot contain credentials");
  }

  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(isLocal && url.protocol === "http:")) {
    throw new Error("Serial instances must use HTTPS");
  }

  return url.origin;
}

export function originPermission(instance: string) {
  const url = new URL(instance);
  return `${url.protocol}//${url.hostname}/*`;
}
