const MEBIBYTE = 1_024 * 1_024;

export const CLIENT_BROWSER_BUDGETS = {
  coldLoad: {
    usableContentMs: 2_000,
    longTaskMs: 50,
    reactCommitMs: 50,
    heapBytes: 128 * MEBIBYTE,
    storageBytes: 16 * MEBIBYTE,
    requests: 700,
    transferBytes: 3 * MEBIBYTE,
    rpcRequests: 8,
    rpcTransferBytes: 2 * MEBIBYTE,
    indexedDbReads: 32,
    indexedDbWrites: 1_600,
  },
  warmHydration: {
    usableContentMs: 800,
    longTaskMs: 50,
    reactCommitMs: 50,
    heapBytes: 128 * MEBIBYTE,
    storageBytes: 16 * MEBIBYTE,
    requests: 700,
    transferBytes: 1.5 * MEBIBYTE,
    rpcRequests: 8,
    rpcTransferBytes: 512 * 1_024,
    indexedDbReads: 1_600,
    indexedDbWrites: 500,
  },
  reconnect: {
    longTaskMs: 50,
    reactCommitMs: 50,
    heapBytes: 128 * MEBIBYTE,
    storageBytes: 16 * MEBIBYTE,
    requests: 12,
    transferBytes: 512 * 1_024,
    rpcRequests: 8,
    rpcTransferBytes: 512 * 1_024,
    indexedDbReads: 16,
    indexedDbWrites: 500,
  },
  pagination: {
    longTaskMs: 50,
    reactCommitMs: 50,
    heapBytes: 128 * MEBIBYTE,
    storageBytes: 16 * MEBIBYTE,
    requests: 6,
    transferBytes: 128 * 1_024,
    rpcRequests: 2,
    rpcTransferBytes: 128 * 1_024,
    indexedDbReads: 16,
    indexedDbWrites: 500,
  },
  reader: {
    usableContentMs: 500,
    longTaskMs: 50,
    reactCommitMs: 50,
    heapBytes: 128 * MEBIBYTE,
    storageBytes: 16 * MEBIBYTE,
    requests: 6,
    transferBytes: 128 * 1_024,
    rpcRequests: 3,
    rpcTransferBytes: 128 * 1_024,
    indexedDbReads: 16,
    indexedDbWrites: 128,
  },
  pageCaptureReader: {
    usableContentMs: 500,
    longTaskMs: 50,
    reactCommitMs: 50,
    heapBytes: 128 * MEBIBYTE,
    storageBytes: 16 * MEBIBYTE,
    requests: 6,
    transferBytes: 128 * 1_024,
    rpcRequests: 3,
    rpcTransferBytes: 128 * 1_024,
    indexedDbReads: 16,
    indexedDbWrites: 128,
  },
} as const;

export type ClientBrowserScenario = keyof typeof CLIENT_BROWSER_BUDGETS;

type BrowserMetrics = {
  usableContentMs: number | null;
  longTasks: number[];
  commits: Array<{ actualDuration: number }>;
  indexedDb: { reads: number; writes: number };
  requests: number;
  transferBytes: number;
  rpcRequests: number;
  rpcTransferBytes: number;
  heapBytes: number | null;
  storageBytes?: number | null;
};

type NumericBudgetKey = Exclude<
  keyof (typeof CLIENT_BROWSER_BUDGETS)[ClientBrowserScenario],
  "usableContentMs" | "longTaskMs" | "reactCommitMs"
>;

const METRIC_LABELS: Record<NumericBudgetKey, string> = {
  heapBytes: "heap bytes",
  storageBytes: "storage bytes",
  requests: "requests",
  transferBytes: "transfer bytes",
  rpcRequests: "RPC requests",
  rpcTransferBytes: "RPC transfer bytes",
  indexedDbReads: "IndexedDB reads",
  indexedDbWrites: "IndexedDB writes",
};

function measuredValue(metrics: BrowserMetrics, key: NumericBudgetKey) {
  if (key === "indexedDbReads") return metrics.indexedDb.reads;
  if (key === "indexedDbWrites") return metrics.indexedDb.writes;
  return metrics[key];
}

export function evaluateClientBrowserScenario(
  scenario: ClientBrowserScenario,
  metrics: BrowserMetrics,
) {
  const budget = CLIENT_BROWSER_BUDGETS[scenario];
  const violations: string[] = [];
  const usableContentBudget =
    "usableContentMs" in budget ? budget.usableContentMs : undefined;
  if (usableContentBudget !== undefined) {
    if (metrics.usableContentMs === null) {
      violations.push("usable-content time was not measured");
    } else if (metrics.usableContentMs > usableContentBudget) {
      violations.push(
        `usable content ${metrics.usableContentMs.toFixed(1)}ms > ${usableContentBudget}ms`,
      );
    }
  }

  const maximumLongTask = Math.max(0, ...metrics.longTasks);
  if (maximumLongTask > budget.longTaskMs) {
    violations.push(
      `long task ${maximumLongTask.toFixed(1)}ms > ${budget.longTaskMs}ms`,
    );
  }
  const maximumReactCommit = Math.max(
    0,
    ...metrics.commits.map((commit) => commit.actualDuration),
  );
  if (maximumReactCommit > budget.reactCommitMs) {
    violations.push(
      `React commit ${maximumReactCommit.toFixed(1)}ms > ${budget.reactCommitMs}ms`,
    );
  }

  const numericBudgetKeys = Object.keys(METRIC_LABELS) as NumericBudgetKey[];
  for (const key of numericBudgetKeys) {
    const limit = budget[key];
    const measured = measuredValue(metrics, key);
    if (measured === null || measured === undefined) {
      violations.push(`${METRIC_LABELS[key]} were not measured`);
    } else if (measured > limit) {
      violations.push(`${METRIC_LABELS[key]} ${measured} > ${limit}`);
    }
  }

  return violations;
}
