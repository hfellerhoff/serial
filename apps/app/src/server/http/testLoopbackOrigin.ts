/**
 * Shared guard for e2e escape hatches that let a production-hardened fetch
 * reach a loopback http fixture server. Authorization is deliberately
 * narrow: an explicit flag variable must be "1", a separate origin variable
 * must name a bare loopback http origin (no path, no credentials, exact
 * origin form), and the candidate URL must match that origin exactly.
 */

export function authorizedTestLoopbackOrigin(
  flagVariable: string,
  originVariable: string,
): URL | undefined {
  if (process.env[flagVariable] !== "1") return undefined;

  const configuredValue = process.env[originVariable];
  if (!configuredValue) return undefined;

  try {
    const configured = new URL(configuredValue);
    if (
      configured.origin !== configuredValue ||
      configured.protocol !== "http:" ||
      (configured.hostname !== "127.0.0.1" && configured.hostname !== "[::1]")
    ) {
      return undefined;
    }
    return configured;
  } catch {
    return undefined;
  }
}

export function isAuthorizedTestLoopbackUrl(
  value: string,
  flagVariable: string,
  originVariable: string,
): boolean {
  const configured = authorizedTestLoopbackOrigin(flagVariable, originVariable);
  if (!configured) return false;

  try {
    const target = new URL(value);
    return (
      target.origin === configured.origin &&
      !target.username &&
      !target.password
    );
  } catch {
    return false;
  }
}
