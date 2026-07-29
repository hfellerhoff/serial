export type AuthBaseUrlConfig = {
  allowedHosts: string[];
  allowedOrigins: string[];
  protocol: "auto";
  fallback: string;
};

export function createAuthBaseUrlConfig(
  publicBaseUrl: string,
  trustedOrigins: Iterable<string>,
): AuthBaseUrlConfig {
  const fallback = new URL(publicBaseUrl).origin;
  const origins = new Set([
    fallback,
    ...Array.from(trustedOrigins, (origin) => new URL(origin).origin),
  ]);

  return {
    allowedHosts: Array.from(
      new Set(Array.from(origins, (origin) => new URL(origin).host)),
    ),
    allowedOrigins: Array.from(origins),
    protocol: "auto",
    fallback,
  };
}

function normalizeHost(value: string | null, protocol: string) {
  if (!value || value !== value.trim() || /[\\/@?#,\s]/.test(value)) {
    return null;
  }

  try {
    return new URL(`${protocol}//${value}`).host.toLowerCase();
  } catch {
    return null;
  }
}

function normalizeForwardedProtocol(value: string | null) {
  return value === "http" || value === "https" ? value : null;
}

function getForwardedOrigin(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProtocol = request.headers.get("x-forwarded-proto");
  const hasForwardedOrigin =
    forwardedHost !== null || forwardedProtocol !== null;

  if (!hasForwardedOrigin) return null;

  const protocol = normalizeForwardedProtocol(forwardedProtocol);
  const host = normalizeHost(forwardedHost, `${protocol ?? "https"}:`);
  if (!protocol || !host) {
    throw new Error(
      "Trusted proxy requests must include valid X-Forwarded-Host and X-Forwarded-Proto headers",
    );
  }

  return { host, protocol };
}

/**
 * Mirrors Better Auth's dynamic base URL host selection for the extension
 * preparation endpoint, which lives outside Better Auth's route handler.
 */
export function resolveAuthBaseOrigin(
  request: Request,
  config: AuthBaseUrlConfig,
  trustProxyHeaders = false,
) {
  const requestUrl = new URL(request.url);
  const forwardedOrigin = trustProxyHeaders
    ? getForwardedOrigin(request)
    : null;
  const protocol =
    forwardedOrigin?.protocol ?? requestUrl.protocol.slice(0, -1);
  const candidateHost =
    forwardedOrigin?.host ??
    normalizeHost(request.headers.get("host"), `${protocol}:`) ??
    requestUrl.host.toLowerCase();

  const isAllowedHost = config.allowedHosts.some(
    (allowedHost) => allowedHost.toLowerCase() === candidateHost,
  );
  if (!isAllowedHost) {
    throw new Error(
      `Authentication request host ${candidateHost} is not configured as trusted`,
    );
  }

  const requestedOrigin = `${protocol}://${candidateHost}`;
  if (!config.allowedOrigins.includes(requestedOrigin)) {
    throw new Error(
      `Authentication request origin ${requestedOrigin} is not configured as trusted`,
    );
  }
  return requestedOrigin;
}

export function getAuthIssuer(
  request: Request,
  config: AuthBaseUrlConfig,
  trustProxyHeaders = false,
) {
  return `${resolveAuthBaseOrigin(request, config, trustProxyHeaders)}/api/auth`;
}
