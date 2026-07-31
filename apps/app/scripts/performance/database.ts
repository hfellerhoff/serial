import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import type {
  Client,
  InArgs,
  InStatement,
  ResultSet,
  Transaction,
  TransactionMode,
} from "@libsql/client";
import type { StatementMeasurement } from "./model";
import * as schema from "~/server/db/schema";

type Journal = {
  entries: Array<{ tag: string }>;
};

type RecordedStatement = StatementMeasurement & {
  startedAt: number;
  endedAt: number;
};

export type InstrumentationSnapshot = {
  databaseDurationMs: number;
  databaseWallMs: number;
  statementCount: number;
  materializedRows: number;
  statements: StatementMeasurement[];
};

export type BenchmarkDatabase = ReturnType<typeof drizzle<typeof schema>>;

function migrationStatements(content: string) {
  return content
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

export async function applyMigrations(client: Client) {
  const migrationsDirectory = resolve("src/server/db/migrations");
  const postMigrationsDirectory = resolve("src/server/db/post-migrations");
  const journal = JSON.parse(
    readFileSync(join(migrationsDirectory, "meta/_journal.json"), "utf8"),
  ) as Journal;

  for (const { tag } of journal.entries) {
    const migration = readFileSync(
      join(migrationsDirectory, `${tag}.sql`),
      "utf8",
    );
    for (const statement of migrationStatements(migration)) {
      await client.execute(statement);
    }

    try {
      const postMigrations = readdirSync(join(postMigrationsDirectory, tag))
        .filter((fileName) => fileName.endsWith(".sql"))
        .sort();
      for (const fileName of postMigrations) {
        const postMigration = readFileSync(
          join(postMigrationsDirectory, tag, fileName),
          "utf8",
        );
        for (const statement of migrationStatements(postMigration)) {
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
}

function statementSql(statement: InStatement | [string, InArgs?]) {
  if (typeof statement === "string") return statement;
  if (Array.isArray(statement)) return statement[0];
  return statement.sql;
}

function recordResult(
  records: RecordedStatement[],
  statement: InStatement | [string, InArgs?],
  result: ResultSet,
  startedAt: number,
  endedAt: number,
) {
  records.push({
    sql: statementSql(statement),
    durationMs: endedAt - startedAt,
    rows: result.rows.length,
    startedAt,
    endedAt,
  });
}

export function createInstrumentedClient(client: Client) {
  let records: RecordedStatement[] = [];

  const instrumentTransaction = (transaction: Transaction) =>
    new Proxy(transaction, {
      get(target, property) {
        if (property === "execute") {
          return async (statement: InStatement) => {
            const startedAt = performance.now();
            const result = await target.execute(statement);
            const endedAt = performance.now();
            recordResult(records, statement, result, startedAt, endedAt);
            return result;
          };
        }
        if (property === "batch") {
          return async (statements: InStatement[]) => {
            const startedAt = performance.now();
            const results = await target.batch(statements);
            const endedAt = performance.now();
            const durationPerStatement =
              statements.length === 0
                ? 0
                : (endedAt - startedAt) / statements.length;
            results.forEach((result, index) => {
              const statement = statements[index];
              if (!statement) return;
              const statementStart = startedAt + durationPerStatement * index;
              recordResult(
                records,
                statement,
                result,
                statementStart,
                statementStart + durationPerStatement,
              );
            });
            return results;
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });

  const instrumented = new Proxy(client, {
    get(target, property) {
      if (property === "execute") {
        return async (statement: InStatement, args?: InArgs) => {
          const normalized =
            typeof statement === "string" && args
              ? { sql: statement, args }
              : statement;
          const startedAt = performance.now();
          const result =
            typeof statement === "string"
              ? await target.execute(statement, args)
              : await target.execute(statement);
          const endedAt = performance.now();
          recordResult(records, normalized, result, startedAt, endedAt);
          return result;
        };
      }
      if (property === "batch") {
        return async (
          statements: Array<InStatement | [string, InArgs?]>,
          mode?: TransactionMode,
        ) => {
          const startedAt = performance.now();
          const results = await target.batch(statements, mode);
          const endedAt = performance.now();
          const durationPerStatement =
            statements.length === 0
              ? 0
              : (endedAt - startedAt) / statements.length;
          results.forEach((result, index) => {
            const statement = statements[index];
            if (!statement) return;
            const statementStart = startedAt + durationPerStatement * index;
            recordResult(
              records,
              statement,
              result,
              statementStart,
              statementStart + durationPerStatement,
            );
          });
          return results;
        };
      }
      if (property === "transaction") {
        return async (mode?: TransactionMode) =>
          instrumentTransaction(await target.transaction(mode));
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });

  return {
    client: instrumented,
    reset() {
      records = [];
    },
    snapshot(): InstrumentationSnapshot {
      const startedAt = Math.min(...records.map((record) => record.startedAt));
      const endedAt = Math.max(...records.map((record) => record.endedAt));
      return {
        databaseDurationMs: records.reduce(
          (total, record) => total + record.durationMs,
          0,
        ),
        databaseWallMs: records.length === 0 ? 0 : endedAt - startedAt,
        statementCount: records.length,
        materializedRows: records.reduce(
          (total, record) => total + record.rows,
          0,
        ),
        statements: records.map(({ sql, durationMs, rows }) => ({
          sql,
          durationMs,
          rows,
        })),
      };
    },
  };
}

export function openBenchmarkDatabase(input: {
  url: string;
  authToken?: string;
}) {
  const baseClient = createClient(input);
  const instrumentation = createInstrumentedClient(baseClient);
  return {
    baseClient,
    database: drizzle({ client: instrumentation.client, schema }),
    instrumentation,
    close: () => baseClient.close(),
  };
}

export function createLocalBenchmarkTarget() {
  const directory = mkdtempSync(join(tmpdir(), "serial-app-benchmark-"));
  return {
    url: `file:${join(directory, "database.sqlite")}`,
    cleanup: () => rmSync(directory, { recursive: true }),
  };
}
