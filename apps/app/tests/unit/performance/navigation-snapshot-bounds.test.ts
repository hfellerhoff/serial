import { afterEach, describe, expect, it } from "vitest";
import {
  applyMigrations,
  createLocalBenchmarkTarget,
  openBenchmarkDatabase,
} from "../../../scripts/performance/database";
import { seedBenchmarkFixture } from "../../../scripts/performance/fixtures";
import type { BenchmarkProfileName } from "../../../scripts/performance/model";
import { queryNavigationSnapshot } from "~/server/navigation/snapshot";

type Session = ReturnType<typeof openBenchmarkDatabase>;
type Target = ReturnType<typeof createLocalBenchmarkTarget>;

const sessions: Session[] = [];
const targets: Target[] = [];

afterEach(() => {
  for (const session of sessions.splice(0)) session.close();
  for (const target of targets.splice(0)) target.cleanup();
});

describe("navigation snapshot performance bounds", () => {
  it.each<BenchmarkProfileName>(["small", "representative", "stress"])(
    "materializes only navigation entities for the %s library",
    async (profileName) => {
      const target = createLocalBenchmarkTarget();
      const session = openBenchmarkDatabase({ url: target.url });
      targets.push(target);
      sessions.push(session);
      await applyMigrations(session.baseClient);
      await seedBenchmarkFixture({
        database: session.database,
        profileName,
        userId: `navigation-${profileName}`,
      });

      session.instrumentation.reset();
      const snapshot = await queryNavigationSnapshot({
        database: session.database,
        userId: `navigation-${profileName}`,
      });
      const evidence = session.instrumentation.snapshot();
      const navigationEntityCount =
        Object.keys(snapshot.views).length +
        Object.keys(snapshot.tags).length +
        Object.keys(snapshot.feeds).length;
      const viewFeedMembershipCount = Object.values(snapshot.viewFeeds).reduce(
        (count, feedAvailability) =>
          count + Object.keys(feedAvailability).length,
        0,
      );

      expect(evidence.statementCount).toBe(6);
      expect(evidence.materializedRows).toBe(
        navigationEntityCount + viewFeedMembershipCount,
      );
      expect(Buffer.byteLength(JSON.stringify(snapshot))).toBeLessThanOrEqual(
        (navigationEntityCount + viewFeedMembershipCount) * 128,
      );
    },
    30_000,
  );
});
