import { describe, expect, it } from "vitest";
import { runClientAuditProfile } from "../../../scripts/performance/client-audit-model";

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
  });
});
