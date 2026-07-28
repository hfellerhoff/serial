import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { reset } from "drizzle-seed";
import * as schema from "../../../src/server/db/schema";

export async function resetDb(tursoPort: number) {
  const client = createClient({ url: `http://127.0.0.1:${tursoPort}` });
  const db = drizzle({ client, schema });

  await reset(db as any, schema as any);
  client.close();
}
