import {
  SERIAL_EXTENSION_AUTH_SCOPES,
  SERIAL_EXTENSION_CLIENT_ID,
} from "./extension-config";

export function createExtensionAuthEndpoints(
  issuer: string,
  redirectUri: string,
) {
  return {
    issuer,
    clientId: SERIAL_EXTENSION_CLIENT_ID,
    scopes: SERIAL_EXTENSION_AUTH_SCOPES,
    authorizationEndpoint: `${issuer}/oauth2/authorize`,
    tokenEndpoint: `${issuer}/oauth2/token`,
    revocationEndpoint: `${issuer}/oauth2/revoke`,
    userInfoEndpoint: `${issuer}/oauth2/userinfo`,
    redirectUri,
  };
}
