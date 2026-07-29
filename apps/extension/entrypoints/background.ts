import {
  AUTH_REDIRECT_PATH,
  AUTH_STORAGE_KEY,
  LAST_INSTANCE_STORAGE_KEY,
  SELECTED_INSTANCE_STORAGE_KEY,
} from "../lib/auth";
import type {
  AuthEndpoints,
  AuthMessage,
  AuthMessageResponse,
  ExtensionAuthSession,
  SerialUser,
} from "../lib/auth";

const TOKEN_EXPIRY_BUFFER_MS = 30_000;

class InvalidSessionError extends Error {}

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
  return (stored[AUTH_STORAGE_KEY] as ExtensionAuthSession | undefined) ?? null;
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
  const response = await fetch(`${instance}/api/extension-auth/prepare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ redirectUri }),
  });
  const payload = (await response.json()) as AuthEndpoints & { error?: string };
  if (!response.ok) {
    throw new Error(
      payload.error ?? "This is not a compatible Serial instance",
    );
  }
  if (payload.issuer !== `${instance}/api/auth`) {
    throw new Error("The Serial instance returned an unexpected issuer");
  }
  return payload;
}

async function requestToken(
  endpoint: string,
  parameters: Record<string, string>,
) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(parameters),
  });
  const payload = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    id_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
    code?: string;
    message?: string;
  };
  if (!response.ok || !payload.access_token) {
    const ErrorType =
      payload.error === "invalid_grant" || payload.error === "invalid_token"
        ? InvalidSessionError
        : Error;
    throw new ErrorType(
      payload.error_description ??
        payload.message ??
        payload.error ??
        payload.code ??
        `Serial sign-in failed (${response.status})`,
    );
  }
  return payload;
}

function revokeToken(
  endpoints: AuthEndpoints,
  token: string,
  tokenType: "access_token" | "refresh_token",
) {
  return fetch(endpoints.revocationEndpoint, {
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
  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new InvalidSessionError("The Serial session is no longer active");
    }
    throw new Error("The Serial session is no longer active");
  }
  const payload = (await response.json()) as {
    sub?: string;
    name?: string;
    picture?: string;
  };
  if (!payload.sub) {
    throw new Error("Serial did not return an account identifier");
  }
  return {
    id: payload.sub,
    name: payload.name,
    picture: payload.picture,
  } satisfies SerialUser;
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
    accessToken: token.access_token!,
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

async function refreshOrKeepSession(session: ExtensionAuthSession) {
  try {
    return await refreshSession(session);
  } catch (error) {
    if (error instanceof InvalidSessionError) {
      await storeSession(null);
      return null;
    }
    return session;
  }
}

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

async function signIn(instance: string) {
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
    interactive: true,
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
      revokeToken(endpoints, token.access_token!, "access_token"),
    ]);
    throw new Error("Serial did not return a persistent extension session");
  }

  let user: SerialUser;
  try {
    user = await fetchUser(endpoints.userInfoEndpoint, token.access_token!);
  } catch (error) {
    await Promise.allSettled([
      revokeToken(endpoints, token.access_token!, "access_token"),
      revokeToken(endpoints, token.refresh_token, "refresh_token"),
    ]);
    throw error;
  }

  const session: ExtensionAuthSession = {
    instance,
    accessToken: token.access_token!,
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
    // Local sign-out still succeeds when the instance is offline.
    await Promise.allSettled([
      revokeToken(session.endpoints, session.accessToken, "access_token"),
      revokeToken(session.endpoints, session.refreshToken, "refresh_token"),
    ]);
    await storeSession(null);
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
        return { ok: true, session: await signIn(message.instance) };
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
