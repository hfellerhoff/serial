export type AuthBaseUrlConfig = {
  allowedHosts: string[];
  protocol: "http" | "https";
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
    allowedHosts: Array.from(origins, (origin) => new URL(origin).host),
    protocol: new URL(fallback).protocol === "http:" ? "http" : "https",
    fallback,
  };
}

function normalizeHost(value: string | null, protocol: "http" | "https") {
  if (!value || value !== value.trim() || /[\\/@?#,\s]/.test(value)) {
    return null;
  }

  try {
    return new URL(`${protocol}://${value}`).host.toLowerCase();
  } catch {
    return null;
  }
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
  const host = normalizeHost(candidate, config.protocol);
  const isAllowed = config.allowedHosts.some(
    (allowedHost) => allowedHost.toLowerCase() === host,
  );

  return isAllowed && host
    ? new URL(`${config.protocol}://${host}`).origin
    : config.fallback;
}

export function getAuthIssuer(request: Request, config: AuthBaseUrlConfig) {
  return `${resolveAuthBaseOrigin(request, config)}/api/auth`;
}
