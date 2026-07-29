import { and, eq, inArray } from "drizzle-orm";
import { getAllowedExtensionRedirectUris } from "./extension-origin";
import { db } from "~/server/db";
import {
  oauthAccessToken,
  oauthClient,
  oauthRefreshToken,
} from "~/server/db/schema";

export const SERIAL_EXTENSION_CLIENT_ID = "serial-browser-extension";
export const SERIAL_EXTENSION_AUTH_SCOPES = [
  "openid",
  "profile",
  "offline_access",
] as const;

export async function ensureExtensionOAuthClient(redirectUri: string) {
  const redirectUris = getAllowedExtensionRedirectUris();
  if (!redirectUris.includes(redirectUri)) {
    throw new Error("This extension redirect URL is not registered");
  }

  const now = new Date();
  await db
    .insert(oauthClient)
    .values({
      id: SERIAL_EXTENSION_CLIENT_ID,
      clientId: SERIAL_EXTENSION_CLIENT_ID,
      name: "Serial browser extension",
      redirectUris,
      scopes: [...SERIAL_EXTENSION_AUTH_SCOPES],
      tokenEndpointAuthMethod: "none",
      grantTypes: ["authorization_code", "refresh_token"],
      responseTypes: ["code"],
      public: true,
      requirePKCE: true,
      skipConsent: true,
      enableEndSession: false,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: oauthClient.clientId,
      set: {
        redirectUris,
        scopes: [...SERIAL_EXTENSION_AUTH_SCOPES],
        disabled: false,
        skipConsent: true,
        enableEndSession: false,
        public: true,
        requirePKCE: true,
        updatedAt: now,
      },
    });
}

export async function revokeExtensionTokensForSession(sessionId: string) {
  const refreshTokens = await db
    .select({ id: oauthRefreshToken.id })
    .from(oauthRefreshToken)
    .where(
      and(
        eq(oauthRefreshToken.clientId, SERIAL_EXTENSION_CLIENT_ID),
        eq(oauthRefreshToken.sessionId, sessionId),
      ),
    )
    .all();

  const refreshTokenIds = refreshTokens.map(({ id }) => id);
  if (refreshTokenIds.length > 0) {
    await db
      .delete(oauthAccessToken)
      .where(inArray(oauthAccessToken.refreshId, refreshTokenIds));
  }

  await db
    .delete(oauthAccessToken)
    .where(
      and(
        eq(oauthAccessToken.clientId, SERIAL_EXTENSION_CLIENT_ID),
        eq(oauthAccessToken.sessionId, sessionId),
      ),
    );
  await db
    .delete(oauthRefreshToken)
    .where(
      and(
        eq(oauthRefreshToken.clientId, SERIAL_EXTENSION_CLIENT_ID),
        eq(oauthRefreshToken.sessionId, sessionId),
      ),
    );
}
