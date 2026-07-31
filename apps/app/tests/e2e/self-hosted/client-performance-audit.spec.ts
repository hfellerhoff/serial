import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { format } from "prettier";
import { SELF_HOSTED_TURSO_PORT } from "../fixtures/ports";
import { cleanupUser, seedClientPerformanceData } from "../fixtures/seed-db";
import { signIn } from "../fixtures/auth";
import type { Page } from "@playwright/test";

test.skip(
  process.env.SERIAL_RUN_CLIENT_PERFORMANCE !== "1",
  "manual retained browser-performance evidence",
);
test.describe.configure({ mode: "serial", timeout: 180_000 });

type BrowserMetrics = {
  durationMs: number;
  usableContentMs: number | null;
  longTasks: number[];
  commits: Array<{ actualDuration: number; baseDuration: number }>;
  indexedDb: { reads: number; writes: number };
  requests: number;
  transferBytes: number;
  rpcRequests: number;
  rpcTransferBytes: number;
  heapBytes: number | null;
};

type PerformanceWindow = Window & {
  __SERIAL_CLIENT_PERFORMANCE__?: {
    commits: Array<{ actualDuration: number; baseDuration: number }>;
  };
};

async function installObservers(page: Page) {
  await page.addInitScript(() => {
    const metrics = {
      longTasks: [] as number[],
      indexedDb: { reads: 0, writes: 0 },
    };
    Object.defineProperty(window, "__SERIAL_BROWSER_AUDIT__", {
      value: metrics,
      configurable: true,
    });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        metrics.longTasks.push(entry.duration);
    }).observe({ type: "longtask", buffered: true });

    const objectStore = IDBObjectStore.prototype;
    const get = objectStore.get;
    const put = objectStore.put;
    objectStore.get = function (...args) {
      metrics.indexedDb.reads++;
      return get.apply(this, args);
    };
    objectStore.put = function (...args) {
      metrics.indexedDb.writes++;
      return put.apply(this, args);
    };
  });
}

async function resetBrowserMetrics(page: Page) {
  await page.evaluate(() => {
    const audit = (
      window as typeof window & {
        __SERIAL_BROWSER_AUDIT__: {
          longTasks: number[];
          indexedDb: { reads: number; writes: number };
        };
      }
    ).__SERIAL_BROWSER_AUDIT__;
    audit.longTasks = [];
    audit.indexedDb = { reads: 0, writes: 0 };
    const performanceWindow = window as PerformanceWindow;
    if (performanceWindow.__SERIAL_CLIENT_PERFORMANCE__) {
      performanceWindow.__SERIAL_CLIENT_PERFORMANCE__.commits = [];
    }
  });
}

async function collectMetrics(
  page: Page,
  inputStartedAt: number,
  network: {
    requests: number;
    transferBytes: number;
    rpcRequests: number;
    rpcTransferBytes: number;
  },
  inputUsableContentMs: number | null = null,
): Promise<BrowserMetrics> {
  return page.evaluate(
    ({
      startedAt,
      requests,
      transferBytes,
      rpcRequests,
      rpcTransferBytes,
      usableContentMs,
    }) => {
      const audit = (
        window as typeof window & {
          __SERIAL_BROWSER_AUDIT__: {
            longTasks: number[];
            indexedDb: { reads: number; writes: number };
          };
          performance: Performance & {
            memory?: { usedJSHeapSize: number };
          };
        }
      ).__SERIAL_BROWSER_AUDIT__;
      return {
        durationMs: performance.now() - startedAt,
        usableContentMs,
        longTasks: audit.longTasks,
        commits:
          (
            window as PerformanceWindow
          ).__SERIAL_CLIENT_PERFORMANCE__?.commits.map(
            ({ actualDuration, baseDuration }) => ({
              actualDuration,
              baseDuration,
            }),
          ) ?? [],
        indexedDb: audit.indexedDb,
        requests,
        transferBytes,
        rpcRequests,
        rpcTransferBytes,
        heapBytes:
          (
            window.performance as Performance & {
              memory?: { usedJSHeapSize: number };
            }
          ).memory?.usedJSHeapSize ?? null,
      };
    },
    {
      startedAt: inputStartedAt,
      usableContentMs: inputUsableContentMs,
      ...network,
    },
  );
}

test("profiles representative cold load, warm hydration, reconnect, pagination, and reader rendering", async ({
  page,
}) => {
  const profile = "representative" as const;
  const { email, password } = await seedClientPerformanceData(
    SELF_HOSTED_TURSO_PORT,
    profile,
  );
  await installObservers(page);

  const client = await page.context().newCDPSession(page);
  await client.send("Network.enable");
  const network = {
    requests: 0,
    transferBytes: 0,
    rpcRequests: 0,
    rpcTransferBytes: 0,
  };
  const rpcRequestIds = new Set<string>();
  client.on("Network.requestWillBeSent", ({ requestId, request }) => {
    network.requests++;
    if (request.url.includes("/api/rpc")) {
      network.rpcRequests++;
      rpcRequestIds.add(requestId);
    }
  });
  client.on("Network.dataReceived", ({ requestId, encodedDataLength }) => {
    network.transferBytes += encodedDataLength;
    if (rpcRequestIds.has(requestId)) {
      network.rpcTransferBytes += encodedDataLength;
    }
  });

  const resetNetwork = () => {
    network.requests = 0;
    network.transferBytes = 0;
    network.rpcRequests = 0;
    network.rpcTransferBytes = 0;
    rpcRequestIds.clear();
  };

  try {
    await signIn({ page, email, password });
    const firstFixtureItem = page.getByText(/Fixture item \d+/).first();
    await expect(firstFixtureItem).toBeVisible({
      timeout: 120_000,
    });
    await page.waitForTimeout(2_200);
    await page.evaluate(async () => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("keyval-store");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction("keyval", "readwrite");
        transaction.objectStore("keyval").clear();
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      database.close();
    });

    resetNetwork();
    await page.goto("/?client-performance-audit=1");
    const coldStartedAt = 0;
    await expect(page.getByText(/Fixture item \d+/).first()).toBeVisible({
      timeout: 120_000,
    });
    const coldUsableContentMs = await page.evaluate(() => performance.now());
    await page.waitForTimeout(2_200);
    const coldLoad = await collectMetrics(
      page,
      coldStartedAt,
      network,
      coldUsableContentMs,
    );

    await resetBrowserMetrics(page);
    resetNetwork();
    await page.reload();
    const warmStartedAt = 0;
    await expect(page.getByText(/Fixture item \d+/).first()).toBeVisible({
      timeout: 120_000,
    });
    const warmUsableContentMs = await page.evaluate(() => performance.now());
    await page.waitForTimeout(2_200);
    const warmHydration = await collectMetrics(
      page,
      warmStartedAt,
      network,
      warmUsableContentMs,
    );

    await resetBrowserMetrics(page);
    resetNetwork();
    const reconnectStartedAt = await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        value: "hidden",
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
      Object.defineProperty(document, "visibilityState", {
        value: "visible",
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
      return performance.now();
    });
    await page.waitForTimeout(3_000);
    const reconnect = await collectMetrics(page, reconnectStartedAt, network);

    await resetBrowserMetrics(page);
    resetNetwork();
    const paginationStartedAt = await page.evaluate(() => performance.now());
    await page.locator('[data-slot="sidebar-inset"]').evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      element.dispatchEvent(new Event("scroll"));
    });
    await page.waitForTimeout(2_000);
    const pagination = await collectMetrics(page, paginationStartedAt, network);

    await resetBrowserMetrics(page);
    resetNetwork();
    const readerStartedAt = await page.evaluate(() => performance.now());
    await page
      .getByText(/Fixture item \d+/)
      .first()
      .click();
    await expect(page.getByText(/Fixture body \d+/)).toBeVisible({
      timeout: 30_000,
    });
    const reader = await collectMetrics(page, readerStartedAt, network);

    const artifact = {
      generatedAt: new Date().toISOString(),
      environment: "local-self-hosted-chromium",
      profile,
      coldLoad,
      warmHydration,
      reconnect,
      pagination,
      reader,
    };
    const output = path.resolve(
      "benchmarks/results/browser-client-representative.json",
    );
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(
      output,
      await format(JSON.stringify(artifact), { parser: "json" }),
      "utf8",
    );
  } finally {
    await cleanupUser(SELF_HOSTED_TURSO_PORT, email);
  }
});
