export const PERFORMANCE_CEILING = 1.5;

export const BENCHMARK_PROFILES = {
  small: {
    feedItems: 1_000,
    bookmarks: 100,
    views: 3,
    warmups: 2,
    repetitions: 7,
  },
  representative: {
    feedItems: 10_000,
    bookmarks: 1_000,
    views: 10,
    warmups: 3,
    repetitions: 15,
  },
  stress: {
    feedItems: 50_000,
    bookmarks: 5_000,
    views: 25,
    warmups: 3,
    repetitions: 15,
  },
} as const;

export type BenchmarkProfileName = keyof typeof BENCHMARK_PROFILES;
export type CacheProfile = "warm" | "cold";
export type OperationName = "feed-view-page" | "mixed-view-page";

export type StatementMeasurement = {
  sql: string;
  durationMs: number;
  rows: number;
};

export type OperationSample = {
  operation: OperationName;
  cache: CacheProfile;
  visibility: "unread" | "read" | "later";
  fullDurationMs: number;
  databaseDurationMs: number;
  databaseWallMs: number;
  statementCount: number;
  materializedRows: number;
  resultBytes: number;
  resultRows: number;
  heapDeltaBytes: number;
  rssDeltaBytes: number;
  statements: StatementMeasurement[];
};

export type Distribution = {
  minimum: number;
  median: number;
  p95: number;
  maximum: number;
};

export type OperationSummary = {
  operation: OperationName;
  samples: number;
  fullDurationMs: Distribution;
  databaseDurationMs: Distribution;
  databaseWallMs: Distribution;
  statementCount: Distribution;
  materializedRows: Distribution;
  resultBytes: Distribution;
  resultRows: Distribution;
  heapDeltaBytes: Distribution;
  rssDeltaBytes: Distribution;
};

export type PairGate = {
  latencyMedianRatio: number;
  latencyP95Ratio: number;
  latencyCeiling: number;
  latencyPassed: boolean;
  structuralRowBudget: number;
  structuralRowsObserved: number;
  structuralPassed: boolean;
  passed: boolean;
};

export function percentile(values: number[], fraction: number) {
  if (values.length === 0) throw new Error("Cannot summarize zero samples");
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.ceil(fraction * sorted.length) - 1;
  return sorted[Math.max(0, index)]!;
}

export function distribution(values: number[]): Distribution {
  return {
    minimum: Math.min(...values),
    median: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    maximum: Math.max(...values),
  };
}

export function summarizeSamples(samples: OperationSample[]): OperationSummary {
  const first = samples[0];
  if (!first) throw new Error("Cannot summarize zero samples");
  const values = <TKey extends keyof OperationSample>(key: TKey) =>
    samples.map((sample) => sample[key] as number);

  return {
    operation: first.operation,
    samples: samples.length,
    fullDurationMs: distribution(values("fullDurationMs")),
    databaseDurationMs: distribution(values("databaseDurationMs")),
    databaseWallMs: distribution(values("databaseWallMs")),
    statementCount: distribution(values("statementCount")),
    materializedRows: distribution(values("materializedRows")),
    resultBytes: distribution(values("resultBytes")),
    resultRows: distribution(values("resultRows")),
    heapDeltaBytes: distribution(values("heapDeltaBytes")),
    rssDeltaBytes: distribution(values("rssDeltaBytes")),
  };
}

export function calculatePairGate(input: {
  baseline: OperationSummary;
  candidate: OperationSummary;
  pageLimit: number;
}): PairGate {
  const { baseline, candidate, pageLimit } = input;
  const latencyMedianRatio =
    candidate.fullDurationMs.median / baseline.fullDurationMs.median;
  const latencyP95Ratio =
    candidate.fullDurationMs.p95 / baseline.fullDurationMs.p95;
  const latencyPassed =
    latencyMedianRatio <= PERFORMANCE_CEILING &&
    latencyP95Ratio <= PERFORMANCE_CEILING;

  // The feed operation already includes all user-level metadata required for a
  // page. A mixed page may materialize at most one additional bounded page of
  // Bookmark rows, plus the sentinel row used to determine hasMore.
  const structuralRowBudget = baseline.materializedRows.maximum + pageLimit + 1;
  const structuralRowsObserved = candidate.materializedRows.maximum;
  const structuralPassed = structuralRowsObserved <= structuralRowBudget;

  return {
    latencyMedianRatio,
    latencyP95Ratio,
    latencyCeiling: PERFORMANCE_CEILING,
    latencyPassed,
    structuralRowBudget,
    structuralRowsObserved,
    structuralPassed,
    passed: latencyPassed && structuralPassed,
  };
}
