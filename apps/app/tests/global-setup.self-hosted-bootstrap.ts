import {
  SELF_HOSTED_BOOTSTRAP_APP_PORT,
  SELF_HOSTED_BOOTSTRAP_TURSO_PORT,
} from "./e2e/fixtures/ports";
import { resetDb } from "./e2e/fixtures/reset-db";

async function waitForApp(url: string, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The production preview can accept requests only after migration.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

export default async function globalSetup() {
  await waitForApp(
    `http://localhost:${SELF_HOSTED_BOOTSTRAP_APP_PORT}/api/health`,
  );
  await resetDb(SELF_HOSTED_BOOTSTRAP_TURSO_PORT);
}
