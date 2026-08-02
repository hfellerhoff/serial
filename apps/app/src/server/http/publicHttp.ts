import { lookup } from "node:dns/promises";
import { Agent } from "undici";
import ipaddr from "ipaddr.js";
import type { LookupFunction } from "node:net";

export class BlockedOutboundTargetError extends Error {}

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
    throw new BlockedOutboundTargetError("The outbound target is not public");
  }
  return results;
}

export async function resolvePublicAddresses(hostname: string) {
  let results;
  try {
    results = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new BlockedOutboundTargetError(
      "The outbound target is unavailable",
    );
  }

  return validatePublicAddresses(results);
}

export function validatePublicHttpUrl(value: string) {
  if (Buffer.byteLength(value, "utf8") > 8 * 1024) {
    throw new BlockedOutboundTargetError("The outbound target is too large");
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new BlockedOutboundTargetError("The outbound target is invalid");
  }

  const expectedPort = parsed.protocol === "http:" ? "80" : "443";
  const effectivePort = parsed.port || expectedPort;
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username ||
    parsed.password ||
    effectivePort !== expectedPort
  ) {
    throw new BlockedOutboundTargetError("The outbound target is not allowed");
  }

  return parsed;
}

function pinnedLookup(address: string, family: 4 | 6): LookupFunction {
  return (_hostname, options, callback) => {
    if (typeof options === "object" && options.all) {
      callback(null, [{ address, family }]);
      return;
    }
    callback(null, address, family);
  };
}

export function createPinnedDispatcher(input: {
  address: string;
  family: 4 | 6;
  hostname: string;
}) {
  return new Agent({
    connect: {
      lookup: pinnedLookup(input.address, input.family),
      servername: input.hostname,
    },
  });
}
