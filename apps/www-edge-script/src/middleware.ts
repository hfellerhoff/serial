export const EDGE_SCRIPT_CONFIG = {
  appUrl: "https://app.serial.tube",
  sessionCookieNames: [
    "better-auth.session_token",
    "__Secure-better-auth.session_token",
  ],
  websiteHostname: "www.serial.tube",
} as const;

export function hasSessionCookie(request: Request): boolean {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return false;

  return cookieHeader.split(";").some((cookiePair) => {
    const separatorIndex = cookiePair.indexOf("=");
    if (separatorIndex === -1) return false;

    const cookieName = cookiePair.slice(0, separatorIndex).trim();
    const cookieValue = cookiePair.slice(separatorIndex + 1).trim();
    const isSessionCookie = EDGE_SCRIPT_CONFIG.sessionCookieNames.some(
      (sessionCookieName) => sessionCookieName === cookieName,
    );

    return isSessionCookie && cookieValue !== "";
  });
}

export function handleOriginRequest(request: Request): Request | Response {
  const requestUrl = new URL(request.url);
  const isWebsiteHomepage =
    requestUrl.hostname === EDGE_SCRIPT_CONFIG.websiteHostname &&
    requestUrl.pathname === "/";

  if (!isWebsiteHomepage || !hasSessionCookie(request)) {
    return request;
  }

  return new Response(null, {
    status: 302,
    headers: {
      "Cache-Control": "private, no-store",
      Location: EDGE_SCRIPT_CONFIG.appUrl,
    },
  });
}
