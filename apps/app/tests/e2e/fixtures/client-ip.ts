import { createHash } from "node:crypto";

export const TEST_CLIENT_IP_HEADER = "x-forwarded-for";

export function getTestClientIp(identity: string) {
  const digest = createHash("sha256").update(identity).digest();
  const secondOctet = 18 + ((digest[0] ?? 0) & 1);
  return `198.${secondOctet}.${digest[1] ?? 0}.${digest[2] ?? 1}`;
}
