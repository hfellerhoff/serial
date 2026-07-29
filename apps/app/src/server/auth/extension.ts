import { and, eq, inArray } from "drizzle-orm";
import { getAllowedExtensionRedirectUris } from "./extension-origin";
import { extensionOAuthClientNeedsUpdate } from "~/lib/extension-auth";
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

function managedExtensionOAuthClientValues() {
  return {
    name: "Serial browser extension",
    redirectUris: getAllowedExtensionRedirectUris(),
    scopes: [...SERIAL_EXTENSION_AUTH_SCOPES],
    tokenEndpointAuthMethod: "none",
    grantTypes: ["authorization_code", "refresh_token"],
    responseTypes: ["code"],
    public: true,
    requirePKCE: true,
    skipConsent: true,
    enableEndSession: false,
  };
}

export async function provisionExtensionOAuthClient() {
  const expected = managedExtensionOAuthClientValues();
  const existing = await db.query.oauthClient.findFirst({
    where: eq(oauthClient.clientId, SERIAL_EXTENSION_CLIENT_ID),
  });

  if (!existing) {
    const now = new Date();
    await db
      .insert(oauthClient)
      .values({
        id: SERIAL_EXTENSION_CLIENT_ID,
        clientId: SERIAL_EXTENSION_CLIENT_ID,
        ...expected,
        disabled: false,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: oauthClient.clientId });
    return "created" as const;
  }

  if (!extensionOAuthClientNeedsUpdate(existing, expected)) {
    return "unchanged" as const;
  }

  await db
    .update(oauthClient)
    .set({
      ...expected,
      // `disabled` is intentionally omitted so an operator can disable the
      // extension client without a public request or restart undoing it.
      updatedAt: new Date(),
    })
    .where(eq(oauthClient.clientId, SERIAL_EXTENSION_CLIENT_ID));
  return "updated" as const;
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
