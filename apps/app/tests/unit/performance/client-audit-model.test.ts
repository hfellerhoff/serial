import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  evaluateClientAuditOperationBudgets,
  runClientAuditProfile,
} from "../../../scripts/performance/client-audit-model";
import type { ClientAuditResult } from "../../../scripts/performance/client-audit-model";

describe("client performance audit model", () => {
  it.each([
    ["small", 12],
    ["representative", 33],
    ["stress", 78],
  ] as const)(
    "keeps %s Bookmark events entity-neutral and projection work scope-bound",
    (profile, loadedMixedScopes) => {
      const result = runClientAuditProfile(profile);

      expect(result.fixture.loadedMixedScopes).toBe(loadedMixedScopes);
      expect(result.operations.bookmarkProgressEvent).toMatchObject({
        bookmarkStoreNotifications: 1,
        mixedStoreNotifications: 0,
        authoritativeRefills: 0,
      });
      expect(result.operations.bookmarkCaptureEvent).toMatchObject({
        bookmarkStoreNotifications: 1,
        mixedStoreNotifications: 0,
        authoritativeRefills: 0,
      });
      expect(result.operations.bookmarkSave.authoritativeRefills).toBe(1);
      expect(
        result.operations.bookmarkOrganizationChange.authoritativeRefills,
      ).toBe(2);
      expect(result.operations.bookmarkDelete.authoritativeRefills).toBe(1);
      expect(result.operations.bookmarkBurstSingleFrame).toMatchObject({
        bookmarkStoreNotifications: 100,
        mixedStoreNotifications: 0,
        authoritativeRefills: 0,
      });
      expect(result.operations.bookmarkBurstSeparateFrames).toMatchObject({
        bookmarkStoreNotifications: 100,
        mixedStoreNotifications: 0,
        authoritativeRefills: 0,
      });
    },
    30_000,
  );

  it("retains bounded list references while identifying whole-cache persistence", () => {
    const result = runClientAuditProfile("small");

    expect(result.fixture.referencesPerScope).toBe(30);
    expect(result.persistedPayloadBytes.application).toBeGreaterThan(
      result.persistedPayloadBytes.mixedContent,
    );
    expect(result.operations.feedProgressEvent.feedItemStoreNotifications).toBe(
      1,
    );
    expect(
      result.operations.feedProgressEvent.feedItemProjectionNotifications,
    ).toBe(0);
    expect(result.operations.feedProgressEvent.feedItemScopeNotifications).toBe(
      0,
    );
    expect(result.operations.feedProgressBurst.feedItemStoreNotifications).toBe(
      1,
    );
    expect(
      result.operations.feedProgressBurst.feedItemProjectionNotifications,
    ).toBe(0);
    expect(result.operations.feedProgressBurst.feedItemScopeNotifications).toBe(
      0,
    );
  });

  it("keeps synchronization pages and normalized persistence mutations within explicit budgets", () => {
    const result = runClientAuditProfile("stress");

    expect(result.synchronizationBytes.request).toBeLessThanOrEqual(
      result.synchronizationBytes.requestBudget,
    );
    expect(result.synchronizationBytes.maximumResponsePage).toBeLessThanOrEqual(
      result.synchronizationBytes.responseBudget,
    );
    expect(result.persistenceMutationBytes.measured).toBeLessThanOrEqual(
      result.persistenceMutationBytes.budget,
    );
    expect(
      result.operations.coldSynchronization.bookmarkStoreNotifications,
    ).toBeLessThanOrEqual(128);
    expect(
      result.operations.coldSynchronization.feedItemStoreNotifications,
    ).toBe(0);
    expect(result.operations.warmSynchronization).toMatchObject({
      bookmarkStoreNotifications: 0,
      feedItemStoreNotifications: 0,
      mixedStoreNotifications: 0,
      authoritativeRefills: 0,
    });
  }, 30_000);

  it("keeps the retained stress profile within explicit operation budgets", async () => {
    const result = JSON.parse(
      await readFile(
        new URL(
          "../../../benchmarks/results/client-stress.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as ClientAuditResult;

    expect(evaluateClientAuditOperationBudgets(result)).toEqual([]);
  });

  it("rejects deliberately reintroduced fan-out, payload, and retention regressions", () => {
    const result = runClientAuditProfile("small");
    result.operations.bookmarkProgressEvent.authoritativeRefills =
      result.fixture.loadedMixedScopes;
    result.synchronizationBytes.maximumResponsePage =
      result.synchronizationBytes.responseBudget + 1;
    result.retention.afterTwentyFourPages.entities =
      result.retention.afterTwelvePages.entities + 1;

    expect(evaluateClientAuditOperationBudgets(result)).toEqual(
      expect.arrayContaining([
        `bookmarkProgressEvent authoritativeRefills: ${result.fixture.loadedMixedScopes} > 0`,
        `Bookmark synchronization response-page bytes: ${result.synchronizationBytes.responseBudget + 1} > ${result.synchronizationBytes.responseBudget}`,
        `retained entities after pagination plateau: ${result.retention.afterTwelvePages.entities + 1} > ${result.retention.afterTwelvePages.entities}`,
      ]),
    );
  });

  it("plateaus repeated pagination within memory, IndexedDB, and mounted-item budgets", () => {
    const result = runClientAuditProfile("small");

    expect(result.retention.afterTwentyFourPages.pages).toBe(
      result.retention.afterTwelvePages.pages,
    );
    expect(result.retention.afterTwentyFourPages.entities).toBe(
      result.retention.afterTwelvePages.entities,
    );
    expect(result.retention.afterTwentyFourPages.scopeReferences).toBe(
      result.retention.afterTwelvePages.scopeReferences,
    );
    expect(result.retention.afterTwentyFourPages.pages).toBeLessThanOrEqual(
      result.retention.budgets.memoryPages,
    );
    expect(
      result.retention.afterTwentyFourPages.retainedBytes,
    ).toBeLessThanOrEqual(result.retention.budgets.memoryBytes);
    expect(
      result.retention.afterTwentyFourPages.retainedHeapBytes,
    ).toBeLessThanOrEqual(
      result.retention.afterTwelvePages.retainedHeapBytes + 1_024,
    );
    expect(
      result.retention.afterTwentyFourPages.persistedPages,
    ).toBeLessThanOrEqual(result.retention.budgets.indexedDbPages);
    expect(
      result.retention.afterTwentyFourPages.persistedBytes,
    ).toBeLessThanOrEqual(result.retention.budgets.indexedDbBytes);
    expect(
      result.retention.afterTwentyFourPages.mountedItems,
    ).toBeLessThanOrEqual(result.retention.budgets.mountedItems);
  });
});
