export function normalizeNavigationResponse(response: Response) {
  if (!response.redirected) return response;
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export function getCacheableNavigationResponse(response: Response) {
  if (!response.ok) return null;
  return normalizeNavigationResponse(response);
}
