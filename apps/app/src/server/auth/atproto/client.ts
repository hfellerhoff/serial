import { randomBytes } from "node:crypto";
import { NodeOAuthClient } from "@atproto/oauth-client-node";
import { safeFetchWrap } from "@atproto-labs/fetch-node";
import {
  getAtprotoClientMetadata,
  getAtprotoKeyset,
  getStoreEncryptionKey,
} from "./config";
import { createAtprotoSessionStore, createAtprotoStateStore } from "./stores";
import type { RuntimeLock } from "@atproto/oauth-client-node";
import { env } from "~/env";
import { db } from "~/server/db";
import { getKV } from "~/server/kv";
import { logError } from "~/server/logger";

/**
 * The one NodeOAuthClient instance. Identity resolution stays inside the
 * SDK with system DNS (its default handle resolver); all outbound protocol
 * traffic goes through a hardened fetch with SSRF protection, a response
 * size cap, and a timeout. Development loosens just enough to reach a local
 * dev PDS over plain HTTP.
 */

const IS_DEV = env.NODE_ENV === "development";

const FETCH_TIMEOUT_MS = 15_000;

/** Refresh-token rotation makes concurrent refreshes destructive; the SDK
 * serializes them through this lock. KV-backed so it holds across app
 * instances sharing a Redis; the in-memory KV fallback (KV_STORE=none)
 * degrades to an in-process mutex, correct for single-instance deploys. */
const LOCK_TTL_SECONDS = 30;
const LOCK_RETRY_MS = 150;

const requestLock: RuntimeLock = async (name, fn) => {
  const kv = await getKV();
  const key = `atproto-lock:${name}`;
  const token = randomBytes(16).toString("hex");

  const deadline = Date.now() + LOCK_TTL_SECONDS * 2 * 1000;
  while (!(await kv.setNX(key, token, LOCK_TTL_SECONDS))) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for atproto lock ${name}`);
    }
    await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
  }

  try {
    return await fn();
  } finally {
    try {
      // Best-effort release: only delete a lock we still hold. The TTL
      // bounds the damage if this races or fails.
      if ((await kv.get(key)) === token) await kv.del(key);
    } catch (err) {
      logError("[atproto] failed to release refresh lock:", err);
    }
  }
};

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
    // non-unicast addresses stay blocked outside development.
    allowCustomPort: true,
    allowHttp: IS_DEV,
    allowPrivateIps: IS_DEV,
    allowIpHost: IS_DEV,
    // The SDK issues requests with the default redirect mode; each hop
    // still passes the same SSRF/protocol checks.
    allowImplicitRedirect: true,
  });

  return new NodeOAuthClient({
    clientMetadata: getAtprotoClientMetadata(),
    keyset,
    stateStore: createAtprotoStateStore(db, encryptionKey),
    sessionStore: createAtprotoSessionStore(db, encryptionKey),
    requestLock,
    fetch,
    allowHttp: IS_DEV,
    ...(env.ATPROTO_PLC_DIRECTORY_URL
      ? { plcDirectoryUrl: env.ATPROTO_PLC_DIRECTORY_URL }
      : {}),
  });
}
