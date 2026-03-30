import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../../../src/server/db/schema";

export async function enablePublicSignups(tursoPort: number) {
  const client = createClient({ url: `http://127.0.0.1:${tursoPort}` });
  const db = drizzle({ client, schema });

  await db
    .insert(schema.appConfig)
    .values({
      key: "public-signup-enabled",
      value: "true",
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.appConfig.key,
      set: { value: "true", updatedAt: new Date() },
    });

  // Validate the row was persisted
  const row = await db
    .select()
    .from(schema.appConfig)
    .where(eq(schema.appConfig.key, "public-signup-enabled"))
    .get();

  if (row?.value !== "true") {
    throw new Error(
      `enablePublicSignups: expected value "true" but got "${row?.value}"`,
    );
  }

  client.close();
}
