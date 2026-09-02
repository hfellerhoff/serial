import { randomBytes } from "node:crypto";
import type { RuntimeLock } from "@atproto/oauth-client-node";
import type { KVStore } from "~/server/kv";
import { logError } from "~/server/logger";

/**
 * Cross-instance mutex for OAuth token refresh. Refresh-token rotation
 * makes concurrent refreshes destructive — the loser presents an
 * already-consumed token and the server may kill the session — so the SDK
 * serializes them through this lock. KV-backed: shared across instances
 * over Redis, degrading to an in-process mutex on the in-memory KV
 * (correct for the single-instance deploys that run without Redis).
 *
 * The TTL must comfortably exceed a slow-but-successful refresh (identity
 * resolution plus the token round trip, each bounded by the client's fetch
 * timeout), or a second instance could enter mid-refresh — the exact race
 * the lock exists to prevent. Release is an atomic compare-and-delete, so
 * an expired-and-reacquired lock is never freed by the previous holder.
 */

const LOCK_TTL_SECONDS = 60;
const LOCK_RETRY_MS = 150;

export function createAtprotoRequestLock(
  getStore: () => Promise<KVStore>,
): RuntimeLock {
  return async (name, fn) => {
    const kv = await getStore();
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
        await kv.delIfEqual(key, token);
      } catch (err) {
        // The TTL bounds the damage of a failed release.
        logError("[atproto] failed to release refresh lock:", err);
      }
    }
  };
}
