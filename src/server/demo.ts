import { randomBytes } from "node:crypto";
import { redirect } from "@tanstack/react-router";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { auth } from "~/server/auth";
import { getKV } from "~/server/kv";
import { IS_DEMO_INSTANCE } from "~/lib/demo";

export function generateDemoEmail() {
  return `${randomBytes(8).toString("hex")}@example.com`;
}

export async function redirectIfDemoUnauthed() {
  if (!IS_DEMO_INSTANCE) return;

  const headers = getRequestHeaders() as Headers;
  const session = await auth.api.getSession({ headers });
  if (!session) {
    throw redirect({ to: "/api/demo/provision" });
  }
}

const DEMO_PROVISION_RATE_LIMIT_KEY = "demo:provision:last-created";
const DEMO_PROVISION_RATE_LIMIT_SECONDS = 1;

/**
 * Check whether the demo provision endpoint is currently rate-limited.
 * Returns `true` if a new account may be created, `false` if rate-limited.
 */
export async function checkDemoProvisionRateLimit(): Promise<boolean> {
  const kv = await getKV();
  const existing = await kv.get(DEMO_PROVISION_RATE_LIMIT_KEY);
  return existing === null;
}

/**
 * Mark the demo provision endpoint as rate-limited for the next second.
 * Call this immediately before attempting to create a demo account.
 */
export async function setDemoProvisionRateLimit(): Promise<void> {
  const kv = await getKV();
  await kv.set(
    DEMO_PROVISION_RATE_LIMIT_KEY,
    String(Date.now()),
    DEMO_PROVISION_RATE_LIMIT_SECONDS,
  );
}
