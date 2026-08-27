import { NodeOAuthClient } from "@atproto/oauth-client-node";
import { safeFetchWrap } from "@atproto-labs/fetch-node";
import {
  getAtprotoClientMetadata,
  getAtprotoKeyset,
  getStoreEncryptionKey,
} from "./config";
import { createAtprotoRequestLock } from "./lock";
import { createAtprotoSessionStore, createAtprotoStateStore } from "./stores";
import { env } from "~/env";
import { db } from "~/server/db";
import { getKV } from "~/server/kv";

/**
 * The one NodeOAuthClient instance. Identity resolution stays inside the
 * SDK with system DNS (its default handle resolver); all outbound protocol
 * traffic goes through a hardened fetch with SSRF protection, a response
 * size cap, and a timeout. Outside production (development and e2e) the
 * guard loosens just enough to reach a local dev PDS over plain HTTP.
 */

const ALLOW_INSECURE_PDS = env.NODE_ENV !== "production";

const FETCH_TIMEOUT_MS = 15_000;

let clientPromise: Promise<NodeOAuthClient> | null = null;

export function getAtprotoClient(): Promise<NodeOAuthClient> {
  if (!clientPromise) {
    clientPromise = buildClient();
    clientPromise.catch(() => {
      clientPromise = null;
    });
  }
  return clientPromise;
}

async function buildClient(): Promise<NodeOAuthClient> {
  const keyset = await getAtprotoKeyset();
  const encryptionKey = getStoreEncryptionKey();

  const fetch = safeFetchWrap({
    timeout: FETCH_TIMEOUT_MS,
    // Real-world PDS hosts may run on non-standard ports; private and
    // non-unicast addresses stay blocked in production.
    allowCustomPort: true,
    allowHttp: ALLOW_INSECURE_PDS,
    allowPrivateIps: ALLOW_INSECURE_PDS,
    allowIpHost: ALLOW_INSECURE_PDS,
    // The SDK issues requests with the default redirect mode; each hop
    // still passes the same SSRF/protocol checks.
    allowImplicitRedirect: true,
  });

  return new NodeOAuthClient({
    clientMetadata: getAtprotoClientMetadata(),
    keyset,
    stateStore: createAtprotoStateStore(db, encryptionKey),
    sessionStore: createAtprotoSessionStore(db, encryptionKey),
    requestLock: createAtprotoRequestLock(getKV),
    fetch,
    allowHttp: ALLOW_INSECURE_PDS,
    ...(env.ATPROTO_PLC_DIRECTORY_URL
      ? { plcDirectoryUrl: env.ATPROTO_PLC_DIRECTORY_URL }
      : {}),
  });
}
