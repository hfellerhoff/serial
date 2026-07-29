import {
  AUTH_REDIRECT_PATH,
  AUTH_STORAGE_KEY,
  EXTENSION_AUTH_SESSION_VERSION,
  getAuthErrorDetails,
  LAST_INSTANCE_STORAGE_KEY,
  parseAuthEndpoints,
  parseSerialUser,
  parseStoredAuthSession,
  parseTokenResponse,
  readAuthJsonResponse,
  SELECTED_INSTANCE_STORAGE_KEY,
} from "../lib/auth";
import { createRefreshSessionSingleFlight } from "../lib/auth-session";
import type {
  AuthEndpoints,
  AuthMessage,
  AuthMessageResponse,
  ExtensionAuthSession,
  SerialUser,
} from "../lib/auth";

const TOKEN_EXPIRY_BUFFER_MS = 30_000;
const INSTANCE_REQUEST_TIMEOUT_MS = 10_000;
class InvalidSessionError extends Error {}

async function fetchFromInstance(
  input: string | URL | Request,
  init?: RequestInit,
) {
  try {
    return await fetch(input, {
      ...init,
      signal: AbortSignal.timeout(INSTANCE_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (
      error instanceof DOMException &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    ) {
      throw new Error("The Serial instance did not respond in time", {
        cause: error,
      });
    }
    throw error;
  }
}

function randomUrlSafeString(size = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function sha256UrlSafe(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function readStoredSession() {
  const stored = await browser.storage.local.get(AUTH_STORAGE_KEY);
  const storedValue = stored[AUTH_STORAGE_KEY];
  const session = parseStoredAuthSession(storedValue);
  if (storedValue !== undefined && !session) {
    await browser.storage.local.remove(AUTH_STORAGE_KEY);
  }
  return session;
}

async function storeSession(session: ExtensionAuthSession | null) {
  if (!session) {
    await browser.storage.local.remove(AUTH_STORAGE_KEY);
    return;
  }
  await browser.storage.local.set({
    [AUTH_STORAGE_KEY]: session,
    [LAST_INSTANCE_STORAGE_KEY]: session.instance,
    [SELECTED_INSTANCE_STORAGE_KEY]: session.instance,
  });
}

async function prepareInstance(
  instance: string,
  redirectUri: string,
): Promise<AuthEndpoints> {
  const response = await fetchFromInstance(
    `${instance}/api/extension-auth/prepare`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ redirectUri }),
    },
  );
  const payload: unknown = await readAuthJsonResponse(response);
  if (!response.ok) {
    const error = getAuthErrorDetails(payload);
    throw new Error(
      error.message ??
        error.error ??
        "This is not a compatible Serial instance",
    );
  }
  return parseAuthEndpoints(instance, redirectUri, payload);
}

async function requestToken(
  endpoint: string,
  parameters: Record<string, string>,
) {
  const response = await fetchFromInstance(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(parameters),
  });
  const payload = await readAuthJsonResponse(response);
  if (!response.ok) {
    const details = getAuthErrorDetails(payload);
    const ErrorType =
      details.error === "invalid_grant" || details.error === "invalid_token"
        ? InvalidSessionError
        : Error;
    throw new ErrorType(
      details.errorDescription ??
        details.message ??
        details.error ??
        details.code ??
        `Serial sign-in failed (${response.status})`,
    );
  }
  return parseTokenResponse(payload);
}

function revokeToken(
  endpoints: AuthEndpoints,
  token: string,
  tokenType: "access_token" | "refresh_token",
) {
  return fetchFromInstance(endpoints.revocationEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      token,
      token_type_hint: tokenType,
      client_id: endpoints.clientId,
    }),
  });
}

async function fetchUser(endpoint: string, accessToken: string) {
  const response = await fetchFromInstance(endpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new InvalidSessionError("The Serial session is no longer active");
    }
    throw new Error("The Serial session is no longer active");
  }
  return parseSerialUser(await readAuthJsonResponse(response));
}

async function refreshSession(session: ExtensionAuthSession) {
  const token = await requestToken(session.endpoints.tokenEndpoint, {
    grant_type: "refresh_token",
    refresh_token: session.refreshToken,
    client_id: session.endpoints.clientId,
  });
  if (!token.refresh_token) {
    throw new Error("Serial did not return a refreshed session");
  }

  const refreshed: ExtensionAuthSession = {
    ...session,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    idToken: token.id_token ?? session.idToken,
    expiresAt: Date.now() + (token.expires_in ?? 300) * 1000,
  };
  // Persist rotated credentials before the follow-up profile request so a
  // transient network error cannot strand us with the now-revoked old token.
  await storeSession(refreshed);
  try {
    refreshed.user = await fetchUser(
      refreshed.endpoints.userInfoEndpoint,
      refreshed.accessToken,
    );
    await storeSession(refreshed);
  } catch (error) {
    if (error instanceof InvalidSessionError) throw error;
  }
  return refreshed;
}

const refreshOrKeepSession = createRefreshSessionSingleFlight({
  refresh: refreshSession,
  readStoredSession,
  clearStoredSession: () => storeSession(null),
  isInvalidSessionError: (error) => error instanceof InvalidSessionError,
});

async function getActiveSession() {
  const session = await readStoredSession();
  if (!session) return null;

  if (session.expiresAt <= Date.now() + TOKEN_EXPIRY_BUFFER_MS) {
    return refreshOrKeepSession(session);
  }

  try {
    session.user = await fetchUser(
      session.endpoints.userInfoEndpoint,
      session.accessToken,
    );
    await storeSession(session);
    return session;
  } catch (error) {
    return error instanceof InvalidSessionError
      ? refreshOrKeepSession(session)
      : session;
  }
}

async function signIn(instance: string, interactive = true) {
  const redirectUri = browser.identity.getRedirectURL(AUTH_REDIRECT_PATH);
  const endpoints = await prepareInstance(instance, redirectUri);
  const state = randomUrlSafeString();
  const verifier = randomUrlSafeString(64);
  const challenge = await sha256UrlSafe(verifier);
  const authorizationUrl = new URL(endpoints.authorizationEndpoint);
  authorizationUrl.search = new URLSearchParams({
    response_type: "code",
    client_id: endpoints.clientId,
    redirect_uri: redirectUri,
    scope: endpoints.scopes.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();

  const completedUrl = await browser.identity.launchWebAuthFlow({
    url: authorizationUrl.toString(),
    interactive,
  });
  if (!completedUrl) {
    throw new Error("Serial sign-in was cancelled");
  }

  const callback = new URL(completedUrl);
  if (callback.searchParams.get("state") !== state) {
    throw new Error("Serial returned an invalid authentication state");
  }
  if (callback.searchParams.get("iss") !== endpoints.issuer) {
    throw new Error("Serial returned an unexpected authentication issuer");
  }
  const oauthError = callback.searchParams.get("error");
  if (oauthError) {
    throw new Error(
      callback.searchParams.get("error_description") ?? oauthError,
    );
  }
  const code = callback.searchParams.get("code");
  if (!code) {
    throw new Error("Serial did not return an authorization code");
  }

  const token = await requestToken(endpoints.tokenEndpoint, {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: endpoints.clientId,
    code_verifier: verifier,
  });
  if (!token.refresh_token) {
    await Promise.allSettled([
      revokeToken(endpoints, token.access_token, "access_token"),
    ]);
    throw new Error("Serial did not return a persistent extension session");
  }

  let user: SerialUser;
  try {
    user = await fetchUser(endpoints.userInfoEndpoint, token.access_token);
  } catch (error) {
    await Promise.allSettled([
      revokeToken(endpoints, token.access_token, "access_token"),
      revokeToken(endpoints, token.refresh_token, "refresh_token"),
    ]);
    throw error;
  }

  const session: ExtensionAuthSession = {
    version: EXTENSION_AUTH_SESSION_VERSION,
    instance,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    idToken: token.id_token,
    expiresAt: Date.now() + (token.expires_in ?? 300) * 1000,
    endpoints,
    user,
  };
  await storeSession(session);
  return session;
}

async function signOut() {
  const session = await readStoredSession();
  if (session) {
    // The extension is a leaf of the Serial session. Revoke its own tokens,
    // but never call the instance end-session endpoint or clear its cookies.
    // Remove local credentials first so revocation remains best effort when
    // the instance is offline or slow.
    await storeSession(null);
    await Promise.allSettled([
      revokeToken(session.endpoints, session.accessToken, "access_token"),
      revokeToken(session.endpoints, session.refreshToken, "refresh_token"),
    ]);
  }
  return null;
}

async function handleAuthMessage(
  message: AuthMessage,
): Promise<AuthMessageResponse> {
  try {
    switch (message.type) {
      case "auth.get-session":
        return { ok: true, session: await getActiveSession() };
      case "auth.sign-in":
        return {
          ok: true,
          session: await signIn(message.instance, message.interactive),
        };
      case "auth.sign-out":
        return { ok: true, session: await signOut() };
    }
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Unable to authenticate with Serial",
    };
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener(
    (message: AuthMessage, _sender, sendResponse) => {
      void handleAuthMessage(message).then(sendResponse);
      return true;
    },
  );
});
