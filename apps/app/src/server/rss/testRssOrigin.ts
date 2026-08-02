export function authorizedTestRssOrigin() {
  if (process.env.SERIAL_TEST_RSS_ALLOW_LOOPBACK !== "1") return undefined;

  const configuredValue = process.env.SERIAL_TEST_RSS_ORIGIN;
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

export function isAuthorizedTestRssUrl(value: string) {
  const configured = authorizedTestRssOrigin();
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
