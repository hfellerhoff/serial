import { describe, expect, it } from "vitest";
import { runClientAuditProfile } from "../../../scripts/performance/client-audit-model";

describe("client performance audit model", () => {
  it("exposes full-scope refill fan-out for list-neutral Bookmark events", () => {
    const result = runClientAuditProfile("small");

    expect(result.fixture.loadedMixedScopes).toBe(12);
    expect(result.operations.bookmarkProgressEvent.authoritativeRefills).toBe(
      result.fixture.loadedMixedScopes,
    );
    expect(result.operations.bookmarkSave.authoritativeRefills).toBe(
      result.fixture.loadedMixedScopes,
    );
    expect(
      result.operations.bookmarkOrganizationChange.authoritativeRefills,
    ).toBe(result.fixture.loadedMixedScopes);
    expect(result.operations.bookmarkDelete.authoritativeRefills).toBe(
      result.fixture.loadedMixedScopes,
    );
    expect(
      result.operations.bookmarkBurstSingleFrame.authoritativeRefills,
    ).toBe(result.fixture.loadedMixedScopes);
    expect(
      result.operations.bookmarkBurstSeparateFrames.authoritativeRefills,
    ).toBe(result.fixture.loadedMixedScopes * 100);
  });

  it("retains bounded list references while identifying whole-cache persistence", () => {
    const result = runClientAuditProfile("small");

    expect(result.fixture.referencesPerScope).toBe(30);
    expect(result.persistedPayloadBytes.application).toBeGreaterThan(
      result.persistedPayloadBytes.mixedContent,
    );
    expect(result.operations.feedProgressEvent.feedItemStoreNotifications).toBe(
      1,
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
    expect(
      result.operations.normalizedPersistenceMutation.durationMs,
    ).toBeLessThan(50);
  });
});
