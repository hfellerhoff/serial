import {
  AUTH_REDIRECT_PATH,
  AUTH_STORAGE_KEY,
  getAuthErrorMessage,
  LAST_INSTANCE_STORAGE_KEY,
  originPermission,
  parseConnectionResponse,
  parseStoredAuthSession,
  readAuthJsonResponse,
  SELECTED_INSTANCE_STORAGE_KEY,
  updateSessionFromResponse,
} from "../lib/auth";
import type {
  AuthMessage,
  AuthMessageResponse,
  ExtensionAuthSession,
} from "../lib/auth";

const INSTANCE_REQUEST_TIMEOUT_MS = 10_000;

async function fetchFromInstance(
  input: string | URL | Request,
  init?: RequestInit,
) {
  try {
    return await fetch(input, {
      ...init,
      credentials: "omit",
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

async function storeSession(session: ExtensionAuthSession) {
  await browser.storage.local.set({
    [AUTH_STORAGE_KEY]: session,
    [LAST_INSTANCE_STORAGE_KEY]: session.instance,
    [SELECTED_INSTANCE_STORAGE_KEY]: session.instance,
  });
}

async function clearSession(session?: ExtensionAuthSession) {
  await browser.storage.local.remove(AUTH_STORAGE_KEY);
  if (session) {
    await Promise.allSettled([
      browser.permissions.remove({
        origins: [originPermission(session.instance)],
      }),
    ]);
  }
}

async function getActiveSession() {
  const session = await readStoredSession();
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    await clearSession(session);
    return null;
  }

  try {
    const response = await fetchFromInstance(
      `${session.instance}/api/extension-auth/session`,
      { headers: { Authorization: `Bearer ${session.token}` } },
    );
    if (response.status === 401 || response.status === 403) {
      await clearSession(session);
      return null;
    }
    const payload = await readAuthJsonResponse(response);
    if (!response.ok) return session;
    const updated = updateSessionFromResponse(session, payload);
    await storeSession(updated);
    return updated;
  } catch {
    return session;
  }
}

function validateCompletedRedirect(completedUrl: string, redirectUri: string) {
  const callback = new URL(completedUrl);
  const expected = new URL(redirectUri);
  if (
    callback.origin !== expected.origin ||
    callback.pathname !== expected.pathname ||
    callback.username ||
    callback.password ||
    callback.hash
  ) {
    throw new Error("Serial returned an unexpected authentication redirect");
  }
  return callback;
}

async function signIn(instance: string) {
  const redirectUri = browser.identity.getRedirectURL(AUTH_REDIRECT_PATH);
  const state = randomUrlSafeString();
  const codeVerifier = randomUrlSafeString(64);
  const codeChallenge = await sha256UrlSafe(codeVerifier);
  const connectionUrl = new URL("/auth/connect-extension", `${instance}/`);
  connectionUrl.search = new URLSearchParams({
    redirect_uri: redirectUri,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  }).toString();

  const completedUrl = await browser.identity.launchWebAuthFlow({
    url: connectionUrl.toString(),
    interactive: true,
  });
  if (!completedUrl) throw new Error("Serial connection was cancelled");

  const callback = validateCompletedRedirect(completedUrl, redirectUri);
  if (callback.searchParams.get("state") !== state) {
    throw new Error("Serial returned an invalid authentication state");
  }
  if (callback.searchParams.get("iss") !== instance) {
    throw new Error("Serial returned an unexpected authentication issuer");
  }
  const callbackError = callback.searchParams.get("error");
  if (callbackError) {
    throw new Error(
      callbackError === "access_denied"
        ? "Serial connection was cancelled"
        : callbackError,
    );
  }
  const code = callback.searchParams.get("code");
  if (!code) throw new Error("Serial did not return a connection code");

  const response = await fetchFromInstance(
    `${instance}/api/extension-auth/exchange`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, codeVerifier, redirectUri }),
    },
  );
  const payload = await readAuthJsonResponse(response);
  if (!response.ok) {
    throw new Error(
      getAuthErrorMessage(payload) ??
        `Serial could not connect the extension (${response.status})`,
    );
  }
  const session = parseConnectionResponse(instance, payload);
  await storeSession(session);
  return session;
}

async function signOut() {
  const session = await readStoredSession();
  await browser.storage.local.remove(AUTH_STORAGE_KEY);
  if (session) {
    await Promise.allSettled([
      fetchFromInstance(`${session.instance}/api/extension-auth/session`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.token}` },
      }),
    ]);
    await Promise.allSettled([
      browser.permissions.remove({
        origins: [originPermission(session.instance)],
      }),
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
          session: await signIn(message.instance),
        };
      case "auth.sign-out":
        return { ok: true, session: await signOut() };
    }
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Unable to connect to Serial",
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
