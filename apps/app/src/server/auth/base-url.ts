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

/**
 * Mirrors Better Auth's dynamic base URL host selection for the extension
 * preparation endpoint, which lives outside Better Auth's route handler.
 */
export function resolveAuthBaseOrigin(
  request: Request,
  config: AuthBaseUrlConfig,
) {
  const candidate =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    new URL(request.url).host;
  const allowedOrigins = config.allowedOrigins.filter((origin) => {
    const allowedUrl = new URL(origin);
    return (
      normalizeHost(candidate, allowedUrl.protocol) ===
      allowedUrl.host.toLowerCase()
    );
  });
  if (allowedOrigins.length === 0) return config.fallback;

  const host = new URL(allowedOrigins[0]!).host;
  const requestProtocol =
    normalizeForwardedProtocol(request.headers.get("x-forwarded-proto")) ??
    new URL(request.url).protocol.replace(":", "");
  const requestedOrigin = `${requestProtocol}://${host}`;
  return allowedOrigins.includes(requestedOrigin)
    ? requestedOrigin
    : allowedOrigins[0]!;
}

export function getAuthIssuer(request: Request, config: AuthBaseUrlConfig) {
  return `${resolveAuthBaseOrigin(request, config)}/api/auth`;
}
