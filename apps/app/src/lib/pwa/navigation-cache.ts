export function normalizeNavigationResponse(response: Response) {
  if (!response.redirected) return response;
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

function responsePathname(response: Response) {
  // Synthetic responses (tests, constructed fallbacks) have an empty URL and
  // carry no redirect risk.
  if (!response.url) return null;
  return new URL(response.url).pathname;
}

/**
 * A navigation response may only be cached under the path that produced it.
 * An unauthenticated fetch of `/` resolves at `/auth/sign-in`; caching that
 * HTML under the requested path would serve the sign-in shell as the offline
 * fallback after the user signs back in.
 */
export function isCacheableNavigationResponse(
  requestUrl: string,
  response: Response,
) {
  if (!response.ok) return false;
  const finalPathname = responsePathname(response);
  return (
    finalPathname === null || finalPathname === new URL(requestUrl).pathname
  );
}

export function getCacheableNavigationResponse(
  requestUrl: string,
  response: Response,
) {
  if (!isCacheableNavigationResponse(requestUrl, response)) return null;
  return normalizeNavigationResponse(response);
}
