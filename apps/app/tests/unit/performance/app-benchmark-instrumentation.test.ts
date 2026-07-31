import { describe, expect, it } from "vitest";
import {
  applyMigrations,
  createLocalBenchmarkTarget,
  openBenchmarkDatabase,
} from "../../../scripts/performance/database";
import { user } from "~/server/db/schema";

describe("app benchmark driver instrumentation", () => {
  it("counts statements and returned/materialized rows", async () => {
    const target = createLocalBenchmarkTarget();
    const session = openBenchmarkDatabase({ url: target.url });
    try {
      await applyMigrations(session.baseClient);
      await session.database.insert(user).values({
        id: "benchmark-instrumentation-user",
        name: "Benchmark instrumentation",
        email: "instrumentation@benchmark.invalid",
        emailVerified: true,
        createdAt: new Date("2026-01-15T12:00:00.000Z"),
        updatedAt: new Date("2026-01-15T12:00:00.000Z"),
      });

      session.instrumentation.reset();
      const rows = await session.database.select().from(user);
      const snapshot = session.instrumentation.snapshot();

      expect(rows).toHaveLength(1);
      expect(snapshot.statementCount).toBe(1);
      expect(snapshot.materializedRows).toBe(1);
      expect(snapshot.databaseDurationMs).toBeGreaterThanOrEqual(0);
      expect(snapshot.databaseWallMs).toBeGreaterThanOrEqual(0);
      expect(snapshot.statements[0]?.sql.toLowerCase()).toContain("select");

      session.instrumentation.reset();
      await session.database.transaction(async (transaction) =>
        transaction.select().from(user),
      );
      const transactionSnapshot = session.instrumentation.snapshot();
      expect(transactionSnapshot.statementCount).toBe(1);
      expect(transactionSnapshot.materializedRows).toBe(1);
    } finally {
      session.close();
      target.cleanup();
    }
  });
});
