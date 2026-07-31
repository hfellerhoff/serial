import { describe, expect, it } from "vitest";
import {
  BENCHMARK_PROFILES,
  calculatePairGate,
  distribution,
  PERFORMANCE_CEILING,
} from "../../../scripts/performance/model";
import type { OperationSummary } from "../../../scripts/performance/model";

function summary(input: {
  operation: "feed-view-page" | "mixed-view-page";
  median: number;
  p95: number;
  maximumRows: number;
}): OperationSummary {
  const duration = {
    minimum: input.median,
    median: input.median,
    p95: input.p95,
    maximum: input.p95,
  };
  const rows = {
    minimum: input.maximumRows,
    median: input.maximumRows,
    p95: input.maximumRows,
    maximum: input.maximumRows,
  };
  const zero = { minimum: 0, median: 0, p95: 0, maximum: 0 };
  return {
    operation: input.operation,
    samples: 15,
    fullDurationMs: duration,
    databaseDurationMs: duration,
    databaseWallMs: duration,
    statementCount: zero,
    materializedRows: rows,
    resultBytes: zero,
    resultRows: zero,
    heapDeltaBytes: zero,
    rssDeltaBytes: zero,
  };
}

describe("app performance benchmark model", () => {
  it("defines the required deterministic fixture populations", () => {
    expect(BENCHMARK_PROFILES.small).toMatchObject({
      feedItems: 1_000,
      bookmarks: 100,
      views: 3,
    });
    expect(BENCHMARK_PROFILES.representative).toMatchObject({
      feedItems: 10_000,
      bookmarks: 1_000,
      views: 10,
    });
    expect(BENCHMARK_PROFILES.stress).toMatchObject({
      feedItems: 50_000,
      bookmarks: 5_000,
      views: 25,
    });
  });

  it("uses nearest-rank median and p95 distributions", () => {
    expect(distribution([7, 1, 5, 3, 9])).toEqual({
      minimum: 1,
      median: 5,
      p95: 9,
      maximum: 9,
    });
  });

  it("passes exactly at the 1.5x median and p95 ceiling", () => {
    const gate = calculatePairGate({
      baseline: summary({
        operation: "feed-view-page",
        median: 10,
        p95: 20,
        maximumRows: 80,
      }),
      candidate: summary({
        operation: "mixed-view-page",
        median: 15,
        p95: 30,
        maximumRows: 111,
      }),
      pageLimit: 30,
    });
    expect(gate.latencyCeiling).toBe(PERFORMANCE_CEILING);
    expect(gate.latencyPassed).toBe(true);
    expect(gate.structuralPassed).toBe(true);
    expect(gate.passed).toBe(true);
  });

  it("fails latency without rounding and independently fails full-library rows", () => {
    const latencyGate = calculatePairGate({
      baseline: summary({
        operation: "feed-view-page",
        median: 10,
        p95: 20,
        maximumRows: 80,
      }),
      candidate: summary({
        operation: "mixed-view-page",
        median: 15.000_001,
        p95: 30,
        maximumRows: 111,
      }),
      pageLimit: 30,
    });
    expect(latencyGate.latencyPassed).toBe(false);

    const structuralGate = calculatePairGate({
      baseline: summary({
        operation: "feed-view-page",
        median: 10,
        p95: 20,
        maximumRows: 80,
      }),
      candidate: summary({
        operation: "mixed-view-page",
        median: 10,
        p95: 20,
        maximumRows: 112,
      }),
      pageLimit: 30,
    });
    expect(structuralGate.structuralRowBudget).toBe(111);
    expect(structuralGate.structuralPassed).toBe(false);
    expect(structuralGate.passed).toBe(false);
  });
});
