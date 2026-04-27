import { MemoryPublisher } from "@orpc/experimental-publisher/memory";
import type {
  GetByViewChunk,
  GetItemsByCategoryIdChunk,
  GetItemsByFeedChunk,
  GetItemsByVisibilityChunk,
  RevalidateViewChunk,
} from "./routers/initialRouter";
import { env } from "~/env";

export type PublishedChunk =
  | { source: "initial"; chunk: GetByViewChunk }
  | { source: "revalidate"; chunk: RevalidateViewChunk }
  | { source: "visibility"; chunk: GetItemsByVisibilityChunk }
  | { source: "feed"; chunk: GetItemsByFeedChunk }
  | { source: "category"; chunk: GetItemsByCategoryIdChunk };

const RESUME_RETENTION_SECONDS = 60 * 2;
const REDIS_KEY_PREFIX = "serial:pub:";
const REDIS_CONNECT_TIMEOUT_MS = 5_000;

type PublisherChannelMap = Record<string, PublishedChunk>;

async function createPublisher() {
  const kvStore = env.KV_STORE;

  if (kvStore === "upstash") {
    const { Redis } = await import("@upstash/redis");
    const { UpstashRedisPublisher } =
      await import("@orpc/experimental-publisher/upstash-redis");

    const redis = new Redis({
      url: env.UPSTASH_REDIS_REST_URL!,
      token: env.UPSTASH_REDIS_REST_TOKEN!,
    });

    console.log("[publisher] Using UpstashRedisPublisher");
    return new UpstashRedisPublisher<PublisherChannelMap>(redis, {
      resumeRetentionSeconds: RESUME_RETENTION_SECONDS,
      prefix: REDIS_KEY_PREFIX,
    });
  }

  if (kvStore === "ioredis") {
    const { default: Redis } = await import("ioredis");
    const { IORedisPublisher } =
      await import("@orpc/experimental-publisher/ioredis");

    const commander = new Redis(env.REDIS_URL!, {
      connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
      maxRetriesPerRequest: 3,
    });
    const listener = new Redis(env.REDIS_URL!, {
      connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    commander.on("error", (err) => {
      console.error("[publisher] Redis commander error:", err.message);
    });
    listener.on("error", (err) => {
      console.error("[publisher] Redis listener error:", err.message);
    });

    console.log("[publisher] Using IORedisPublisher");
    return new IORedisPublisher<PublisherChannelMap>({
      commander,
      listener,
      resumeRetentionSeconds: RESUME_RETENTION_SECONDS,
      prefix: REDIS_KEY_PREFIX,
    });
  }

  console.log("[publisher] Using MemoryPublisher (KV_STORE is 'none')");
  return new MemoryPublisher<PublisherChannelMap>({
    resumeRetentionSeconds: RESUME_RETENTION_SECONDS,
  });
}

// Use a global symbol to ensure a single publisher instance across all
// module contexts. Nitro tasks can re-instantiate modules in a separate
// context, which would create a second MemoryPublisher that has no
// subscribers — causing publishes from background-refresh to silently
// go nowhere. globalThis guarantees the same instance is shared.
const PUBLISHER_KEY = Symbol.for("serial:publisher");
const globalRef = globalThis as unknown as Record<
  symbol,
  Awaited<ReturnType<typeof createPublisher>>
>;

if (!globalRef[PUBLISHER_KEY]) {
  globalRef[PUBLISHER_KEY] = await createPublisher();
}

export const publisher = globalRef[PUBLISHER_KEY];

// ---------------------------------------------------------------------------
// Connected-channel tracking
// ---------------------------------------------------------------------------
// Tracks which SSE channels have at least one active subscriber.
// Used by the background-refresh task to skip publishing for users
// with no connected client.

const CONNECTED_KEY = Symbol.for("serial:connectedChannels");
const connectedRef = globalThis as unknown as Record<
  symbol,
  Map<string, number>
>;
if (!connectedRef[CONNECTED_KEY]) {
  connectedRef[CONNECTED_KEY] = new Map<string, number>();
}

const connectedChannels = connectedRef[CONNECTED_KEY];

/** Call when a client subscribes to a channel. Returns a cleanup function. */
export function trackChannelConnection(channel: string): () => void {
  const count = connectedChannels.get(channel) ?? 0;
  connectedChannels.set(channel, count + 1);
  return () => {
    const current = connectedChannels.get(channel) ?? 1;
    if (current <= 1) {
      connectedChannels.delete(channel);
    } else {
      connectedChannels.set(channel, current - 1);
    }
  };
}

/** Check whether a channel has any active subscribers. */
export function hasSubscribers(channel: string): boolean {
  return (connectedChannels.get(channel) ?? 0) > 0;
}
