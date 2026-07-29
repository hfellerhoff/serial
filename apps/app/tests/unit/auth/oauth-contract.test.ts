import { createHash, randomBytes } from "node:crypto";
import { oauthProvider } from "@better-auth/oauth-provider";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";
import { createAuthBaseUrlConfig, getAuthIssuer } from "~/server/auth/base-url";
import {
  SERIAL_EXTENSION_AUTH_SCOPES,
  SERIAL_EXTENSION_CLIENT_ID,
} from "~/server/auth/extension-config";
import { createExtensionAuthEndpoints } from "~/server/auth/extension-endpoints";

const CANONICAL_ORIGIN = "https://serial.example.com";
const ALIAS_ORIGIN = "https://alias.example.com";
const REDIRECT_URI = "https://extension.chromiumapp.org/serial-auth";
const authBaseUrlConfig = createAuthBaseUrlConfig(CANONICAL_ORIGIN, [
  ALIAS_ORIGIN,
]);

function base64Url(value: Buffer) {
  return value.toString("base64url");
}

function formRequest(
  endpoint: string,
  parameters: Record<string, string>,
  headers: HeadersInit = {},
) {
  return new Request(endpoint, {
    method: "POST",
    headers: {
      ...Object.fromEntries(new Headers(headers)),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(parameters),
  });
}

describe.each([CANONICAL_ORIGIN, ALIAS_ORIGIN])(
  "extension OAuth contract on %s",
  (origin) => {
    it("prepares, authorizes with PKCE, rotates, identifies, and revokes", async () => {
      const { auth, db, signInWithTestUser } = await getTestInstance({
        baseURL: authBaseUrlConfig,
        advanced: { trustedProxyHeaders: false },
        plugins: [
          oauthProvider({
            loginPage: "/auth/sign-in",
            consentPage: "/auth/extension-consent",
            scopes: [...SERIAL_EXTENSION_AUTH_SCOPES],
            cachedTrustedClients: new Set([SERIAL_EXTENSION_CLIENT_ID]),
            disableJwtPlugin: true,
            allowDynamicClientRegistration: false,
            allowUnauthenticatedClientRegistration: false,
          }),
        ],
      });

      const now = new Date();
      await db.create({
        model: "oauthClient",
        data: {
          clientId: SERIAL_EXTENSION_CLIENT_ID,
          name: "Serial browser extension",
          redirectUris: [REDIRECT_URI],
          scopes: [...SERIAL_EXTENSION_AUTH_SCOPES],
          tokenEndpointAuthMethod: "none",
          grantTypes: ["authorization_code", "refresh_token"],
          responseTypes: ["code"],
          public: true,
          requirePKCE: true,
          skipConsent: true,
          enableEndSession: false,
          disabled: false,
          createdAt: now,
          updatedAt: now,
        },
      });

      const issuer = getAuthIssuer(
        new Request(`${origin}/api/extension-auth/prepare`),
        authBaseUrlConfig,
      );
      const prepared = createExtensionAuthEndpoints(issuer, REDIRECT_URI);
      expect(prepared).toMatchObject({
        issuer: `${origin}/api/auth`,
        clientId: SERIAL_EXTENSION_CLIENT_ID,
        scopes: SERIAL_EXTENSION_AUTH_SCOPES,
        redirectUri: REDIRECT_URI,
      });

      const signedIn = await signInWithTestUser();
      const verifier = base64Url(randomBytes(48));
      const challenge = base64Url(
        createHash("sha256").update(verifier).digest(),
      );
      const state = base64Url(randomBytes(24));
      const authorizationUrl = new URL(prepared.authorizationEndpoint);
      authorizationUrl.search = new URLSearchParams({
        response_type: "code",
        client_id: prepared.clientId,
        redirect_uri: prepared.redirectUri,
        scope: prepared.scopes.join(" "),
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
      }).toString();
      const authorizationHeaders = new Headers(signedIn.headers);
      authorizationHeaders.set("Host", new URL(origin).host);
      const authorizationResponse = await auth.handler(
        new Request(authorizationUrl, { headers: authorizationHeaders }),
      );
      expect(authorizationResponse.status).toBe(302);

      const callback = new URL(authorizationResponse.headers.get("Location")!);
      expect(callback.origin + callback.pathname).toBe(REDIRECT_URI);
      expect(callback.searchParams.get("state")).toBe(state);
      expect(callback.searchParams.get("iss")).toBe(prepared.issuer);
      const authorizationCode = callback.searchParams.get("code");
      expect(authorizationCode).toBeTruthy();

      const tokenResponse = await auth.handler(
        formRequest(prepared.tokenEndpoint, {
          grant_type: "authorization_code",
          code: authorizationCode!,
          redirect_uri: prepared.redirectUri,
          client_id: prepared.clientId,
          code_verifier: verifier,
        }),
      );
      expect(tokenResponse.status).toBe(200);
      const initialTokens = (await tokenResponse.json()) as {
        access_token: string;
        refresh_token: string;
      };
      expect(initialTokens.access_token).toBeTruthy();
      expect(initialTokens.refresh_token).toBeTruthy();

      const refreshResponse = await auth.handler(
        formRequest(prepared.tokenEndpoint, {
          grant_type: "refresh_token",
          refresh_token: initialTokens.refresh_token,
          client_id: prepared.clientId,
        }),
      );
      expect(refreshResponse.status).toBe(200);
      const rotatedTokens = (await refreshResponse.json()) as {
        access_token: string;
        refresh_token: string;
      };
      expect(rotatedTokens.refresh_token).not.toBe(initialTokens.refresh_token);

      const userInfoResponse = await auth.handler(
        new Request(prepared.userInfoEndpoint, {
          headers: { Authorization: `Bearer ${rotatedTokens.access_token}` },
        }),
      );
      expect(userInfoResponse.status).toBe(200);
      await expect(userInfoResponse.json()).resolves.toMatchObject({
        sub: signedIn.user.id,
      });

      const revokeAccessResponse = await auth.handler(
        formRequest(prepared.revocationEndpoint, {
          token: rotatedTokens.access_token,
          token_type_hint: "access_token",
          client_id: prepared.clientId,
        }),
      );
      expect(revokeAccessResponse.ok).toBe(true);
      const rejectedUserInfo = await auth.handler(
        new Request(prepared.userInfoEndpoint, {
          headers: { Authorization: `Bearer ${rotatedTokens.access_token}` },
        }),
      );
      expect(rejectedUserInfo.status).toBeGreaterThanOrEqual(400);

      const revokeRefreshResponse = await auth.handler(
        formRequest(prepared.revocationEndpoint, {
          token: rotatedTokens.refresh_token,
          token_type_hint: "refresh_token",
          client_id: prepared.clientId,
        }),
      );
      expect(revokeRefreshResponse.ok).toBe(true);
      const rejectedRefresh = await auth.handler(
        formRequest(prepared.tokenEndpoint, {
          grant_type: "refresh_token",
          refresh_token: rotatedTokens.refresh_token,
          client_id: prepared.clientId,
        }),
      );
      expect(rejectedRefresh.status).toBe(400);
      await expect(rejectedRefresh.json()).resolves.toMatchObject({
        error: "invalid_grant",
      });
    });
  },
);
