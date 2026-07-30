import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "~/server/db/schema";

type Journal = {
  entries: Array<{ tag: string }>;
};

const MIGRATIONS_DIRECTORY = "src/server/db/migrations";
const POST_MIGRATIONS_DIRECTORY = "src/server/db/post-migrations";

function statements(content: string) {
  return content
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

export async function createBookmarkTestDatabase() {
  const directory = mkdtempSync(join(tmpdir(), "serial-bookmark-test-"));
  const client = createClient({ url: `file:${directory}/database.sqlite` });
  const database = drizzle({ client, schema });
  const journal = JSON.parse(
    readFileSync(`${MIGRATIONS_DIRECTORY}/meta/_journal.json`, "utf8"),
  ) as Journal;

  for (const { tag } of journal.entries) {
    const migration = readFileSync(
      `${MIGRATIONS_DIRECTORY}/${tag}.sql`,
      "utf8",
    );
    for (const statement of statements(migration)) {
      await client.execute(statement);
    }

    try {
      const postMigrations = readdirSync(`${POST_MIGRATIONS_DIRECTORY}/${tag}`)
        .filter((fileName) => fileName.endsWith(".sql"))
        .sort();
      for (const fileName of postMigrations) {
        const postMigration = readFileSync(
          `${POST_MIGRATIONS_DIRECTORY}/${tag}/${fileName}`,
          "utf8",
        );
        for (const statement of statements(postMigration)) {
          await client.execute(statement);
        }
      }
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "ENOENT"
      ) {
        throw error;
      }
    }
  }

  await client.execute("PRAGMA foreign_keys = ON");
  return {
    client,
    database,
    cleanup: () => {
      client.close();
      rmSync(directory, { recursive: true });
    },
  };
}
