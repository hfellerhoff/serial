import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";

export class BlockedCaptureTargetError extends Error {}

export function isPublicIpAddress(value: string) {
  let address: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    address = ipaddr.parse(value);
  } catch {
    return false;
  }

  if (address.kind() === "ipv6") {
    const ipv6Address = address as ipaddr.IPv6;
    if (ipv6Address.isIPv4MappedAddress()) {
      address = ipv6Address.toIPv4Address();
    }
  }

  return address.range() === "unicast";
}

export function validatePublicAddresses(
  results: Array<{ address: string; family: number }>,
) {
  if (
    results.length === 0 ||
    results.some((result) => !isPublicIpAddress(result.address))
  ) {
    throw new BlockedCaptureTargetError("The capture target is not public");
  }
  return results;
}

export async function resolvePublicAddresses(hostname: string) {
  let results;
  try {
    results = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new BlockedCaptureTargetError("The capture target is unavailable");
  }

  return validatePublicAddresses(results);
}

export function validateServerCaptureUrl(value: string) {
  if (Buffer.byteLength(value, "utf8") > 8 * 1024) {
    throw new BlockedCaptureTargetError("The capture target is too large");
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new BlockedCaptureTargetError("The capture target is invalid");
  }

  const expectedPort = parsed.protocol === "http:" ? "80" : "443";
  const effectivePort = parsed.port || expectedPort;
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username ||
    parsed.password ||
    effectivePort !== expectedPort
  ) {
    throw new BlockedCaptureTargetError("The capture target is not allowed");
  }

  return parsed;
}
