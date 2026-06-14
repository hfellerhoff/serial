import crypto from "node:crypto";
import fs from "node:fs";
import { config } from "dotenv";
import { sql } from "drizzle-orm";

// Load .env.local for local dev/build. In production the platform provides env
// vars directly; during e2e tests dotenv-cli injects them from .env.test.* files.
// Note: Nitro's Vite plugin auto-loads both .env AND .env.local in dev mode,
// so e2e test env files must explicitly empty-override any secrets from .env.local.
config({ path: ".env.local" });

// Dynamic import so env vars are loaded before env.js evaluates process.env
const { db } = await import("./index.js");

const MIGRATIONS_FOLDER = "src/server/db/migrations";
const POST_MIGRATIONS_FOLDER = "src/server/db/post-migrations";
const MIGRATIONS_TABLE = "__drizzle_migrations";
const CONNECT_TIMEOUT_MS = 30_000;

interface JournalEntry {
  idx: number;
  tag: string;
  when: number;
}

type PostMigrationFile = {
  name: string;
  statements: string[];
};

function readJournal(): JournalEntry[] {
  const journalPath = `${MIGRATIONS_FOLDER}/meta/_journal.json`;
  if (!fs.existsSync(journalPath)) {
    throw new Error(
      `Can't find meta/_journal.json file in ${MIGRATIONS_FOLDER}`,
    );
  }
  const raw = fs.readFileSync(journalPath, "utf-8");
  const entries = (JSON.parse(raw) as { entries: JournalEntry[] }).entries;

  for (const entry of entries) {
    const migrationPath = `${MIGRATIONS_FOLDER}/${entry.tag}.sql`;
    if (!fs.existsSync(migrationPath)) {
      throw new Error(
        `No file ${entry.tag}.sql found in ${MIGRATIONS_FOLDER} folder`,
      );
    }
  }

  return entries;
}

function getMigrationStatements(content: string) {
  return content
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
}

function readPostMigrationFiles(tag: string): PostMigrationFile[] {
  const directoryPath = `${POST_MIGRATIONS_FOLDER}/${tag}`;
  if (!fs.existsSync(directoryPath)) return [];

  const directoryStats = fs.statSync(directoryPath);
  if (!directoryStats.isDirectory()) {
    throw new Error(`${directoryPath} exists but is not a directory`);
  }

  return fs
    .readdirSync(directoryPath)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b))
    .map((fileName) => {
      const filePath = `${directoryPath}/${fileName}`;
      const content = fs.readFileSync(filePath, "utf-8");
      return {
        name: fileName,
        statements: getMigrationStatements(content),
      };
    });
}

async function runPostMigrationFiles(
  runner: Pick<typeof db, "run">,
  tag: string,
) {
  const files = readPostMigrationFiles(tag);
  if (files.length === 0) return;

  console.log(`[migrate]     ${files.length} post-migration file(s)`);

  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const fileStart = performance.now();
    console.log(
      `[migrate]     [${i + 1}/${files.length}] ${file.name} (${file.statements.length} statement(s))...`,
    );

    for (const stmt of file.statements) {
      await runner.run(sql.raw(stmt));
    }

    console.log(
      `[migrate]     [${i + 1}/${files.length}] ${file.name} done (${(
        performance.now() - fileStart
      ).toFixed(0)}ms)`,
    );
  }
}

async function run() {
  const startTime = performance.now();

  // ── Connectivity check ──────────────────────────────────────────────
  console.log("[migrate] testing database connectivity…");
  const connectStart = performance.now();
  try {
    await Promise.race([
      db.run(sql`SELECT 1`),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`timed out after ${CONNECT_TIMEOUT_MS}ms`)),
          CONNECT_TIMEOUT_MS,
        ),
      ),
    ]);
    console.log(
      `[migrate] connected (${(performance.now() - connectStart).toFixed(0)}ms)`,
    );
  } catch (err) {
    console.error("[migrate] connectivity check failed:", err);
    process.exit(1);
  }

  // ── Ensure migrations table exists ──────────────────────────────────
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS ${sql.identifier(MIGRATIONS_TABLE)} (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at numeric
    )
  `);

  // ── Determine pending migrations ────────────────────────────────────
  const journal = readJournal();

  let lastAppliedAt = 0;
  const rows = await db.values<[number, string, number]>(
    sql`SELECT id, hash, created_at FROM ${sql.identifier(MIGRATIONS_TABLE)} ORDER BY created_at DESC LIMIT 1`,
  );
  if (rows[0]) {
    lastAppliedAt = Number(rows[0][2]);
  }

  const applied =
    journal.length - journal.filter((e) => e.when > lastAppliedAt).length;
  const pending = journal.filter((entry) => entry.when > lastAppliedAt);

  if (pending.length === 0) {
    const totalMs = (performance.now() - startTime).toFixed(0);
    console.log(
      `[migrate] no pending migrations (${applied} already applied, ${totalMs}ms total)`,
    );
    return;
  }

  console.log(
    `[migrate] ${pending.length} pending migration(s) (${applied} already applied)`,
  );

  // ── Run pending migrations one at a time ─────────────────────────────
  for (let i = 0; i < pending.length; i++) {
    const entry = pending[i]!;
    const migrationStart = performance.now();
    const filePath = `${MIGRATIONS_FOLDER}/${entry.tag}.sql`;
    const content = fs.readFileSync(filePath, "utf-8");
    const statements = getMigrationStatements(content);
    const hash = crypto.createHash("sha256").update(content).digest("hex");

    console.log(
      `[migrate]   [${i + 1}/${pending.length}] ${entry.tag} (${statements.length} statement(s))...`,
    );

    await db.transaction(async (tx) => {
      for (const stmt of statements) {
        await tx.run(sql.raw(stmt));
      }

      await runPostMigrationFiles(tx, entry.tag);

      await tx.run(
        sql`INSERT INTO ${sql.identifier(MIGRATIONS_TABLE)} ("hash", "created_at") VALUES (${hash}, ${entry.when})`,
      );
    });

    const migrationMs = (performance.now() - migrationStart).toFixed(0);
    console.log(
      `[migrate]   [${i + 1}/${pending.length}] ${entry.tag} done (${migrationMs}ms)`,
    );
  }

  const totalMs = (performance.now() - startTime).toFixed(0);
  console.log(
    `[migrate] done — ${pending.length} migration(s) applied (${totalMs}ms total)`,
  );
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[migrate] failed:", err);
    process.exit(1);
  });
