import { enablePublicSignups } from "./e2e/fixtures/enable-public-signups";
import {
  SELF_HOSTED_APP_PORT,
  SELF_HOSTED_TURSO_PORT,
} from "./e2e/fixtures/ports";
import { resetDb } from "./e2e/fixtures/reset-db";

async function waitForApp(url: string, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

export default async function globalSetup() {
  await waitForApp(`http://localhost:${SELF_HOSTED_APP_PORT}/api/health`);
  await resetDb(SELF_HOSTED_TURSO_PORT);
  await enablePublicSignups(SELF_HOSTED_TURSO_PORT);
}
