import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  CLIENT_BROWSER_BUDGETS,
  evaluateClientBrowserScenario,
} from "../../../scripts/performance/client-browser-budgets";

describe("client browser performance budgets", () => {
  it("keeps the retained representative production-browser profile in budget", async () => {
    const baselines = JSON.parse(
      await readFile(
        new URL(
          "../../fixtures/performance/budget-baselines.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as {
      browser: Record<
        string,
        Parameters<typeof evaluateClientBrowserScenario>[1]
      >;
    };
    const violations = Object.keys(CLIENT_BROWSER_BUDGETS).flatMap((scenario) =>
      evaluateClientBrowserScenario(
        scenario as keyof typeof CLIENT_BROWSER_BUDGETS,
        baselines.browser[scenario]!,
      ).map((violation) => `${scenario}: ${violation}`),
    );

    expect(violations).toEqual([]);
  });

  it("reports each enforced measurement", () => {
    const violations = evaluateClientBrowserScenario("reader", {
      usableContentMs: null,
      longTasks: [51],
      commits: [{ actualDuration: 51 }],
      indexedDb: {
        reads: Number.POSITIVE_INFINITY,
        writes: Number.POSITIVE_INFINITY,
      },
      requests: Number.POSITIVE_INFINITY,
      transferBytes: Number.POSITIVE_INFINITY,
      rpcRequests: Number.POSITIVE_INFINITY,
      rpcTransferBytes: Number.POSITIVE_INFINITY,
      heapBytes: null,
      storageBytes: null,
    });

    expect(violations).toHaveLength(11);
  });
});
