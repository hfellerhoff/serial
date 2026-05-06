import { defineTask } from "nitro/task";
import { db } from "../../../src/server/db";
import { user, verification } from "../../../src/server/db/schema";
import { env } from "../../../src/env";
import { IS_BILLING_ENABLED } from "~/server/subscriptions/polar";

export default defineTask({
  meta: {
    name: "demo:midnight-wipe",
    description: "Wipe all demo data at midnight UTC",
  },
  async run() {
    if (env.VITE_PUBLIC_IS_DEMO_INSTANCE !== "true") {
      return { result: "skipped-not-demo" };
    }

    // Add additional checks due to how terrifying this is to get wrong
    if (env.VITE_PUBLIC_IS_MAIN_INSTANCE === "true" || IS_BILLING_ENABLED) {
      return { result: "skipped-not-demo" };
    }

    console.log("[demo:midnight-wipe] Starting data wipe...");

    // Delete all verification rows (no user cascade)
    await db.delete(verification);

    // Delete all users — cascade deletes sessions, accounts, feeds, feed items,
    // views, categories, and all other user-related data.
    await db.delete(user);

    // Clear Redis if configured
    if (env.KV_STORE === "ioredis" && env.REDIS_URL) {
      const { default: Redis } = await import("ioredis");
      const redis = new Redis(env.REDIS_URL);
      await redis.flushdb();
      await redis.quit();
      console.log("[demo:midnight-wipe] Redis flushed");
    }

    console.log("[demo:midnight-wipe] Data wipe complete");
    return { result: "wiped" };
  },
});
