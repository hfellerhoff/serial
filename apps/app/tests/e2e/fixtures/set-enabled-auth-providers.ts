import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../../../src/server/db/schema";
import type { AuthProvider } from "../../../src/lib/constants";

export async function setEnabledAuthProviders(
  tursoPort: number,
  providers: AuthProvider[],
) {
  const client = createClient({ url: `http://127.0.0.1:${tursoPort}` });
  const db = drizzle({ client, schema });
  const value = JSON.stringify(providers);
  const now = new Date();

  try {
    for (const key of [
      "enabled-signin-providers",
      "enabled-signup-providers",
    ] as const) {
      await db
        .insert(schema.appConfig)
        .values({ key, value, updatedAt: now })
        .onConflictDoUpdate({
          target: schema.appConfig.key,
          set: { value, updatedAt: now },
        });

      const row = await db
        .select()
        .from(schema.appConfig)
        .where(eq(schema.appConfig.key, key))
        .get();

      if (row?.value !== value) {
        throw new Error(
          `setEnabledAuthProviders: expected "${value}" for ${key} but got "${row?.value}"`,
        );
      }
    }
  } finally {
    client.close();
  }
}
