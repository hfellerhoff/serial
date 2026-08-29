import { NodeOAuthClient } from "@atproto/oauth-client-node";
import {
  getAtprotoClientMetadata,
  getAtprotoKeyset,
  getStoreEncryptionKey,
} from "./config";
import { ALLOW_INSECURE_PDS, createHardenedFetch } from "./hardened-fetch";
import { createAtprotoRequestLock } from "./lock";
import { createAtprotoSessionStore, createAtprotoStateStore } from "./stores";
import { env } from "~/env";
import { db } from "~/server/db";
import { getKV } from "~/server/kv";

/**
 * The one NodeOAuthClient instance. Identity resolution stays inside the
 * SDK with system DNS (its default handle resolver); all outbound protocol
 * traffic goes through the hardened fetch (./hardened-fetch) with SSRF
 * protection, a response size cap, and a timeout.
 */

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

  const fetch = createHardenedFetch();

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
