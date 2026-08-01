import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { format } from "prettier";
import {
  applyMigrations,
  createLocalBenchmarkTarget,
  openBenchmarkDatabase,
} from "./database";
import { removeBenchmarkFixture, seedBenchmarkFixture } from "./fixtures";
import {
  BENCHMARK_PROFILES,
  calculatePairGate,
  summarizeSamples,
} from "./model";
import { queryFeedViewPage, queryMixedViewPage } from "./operations";
import type {
  BenchmarkProfileName,
  CacheProfile,
  OperationName,
  OperationSample,
} from "./model";

const PAGE_LIMIT = 30;
const PRE_BOOKMARK_PRODUCTION_REF = "090d075f";
const VISIBILITIES = ["unread", "read", "later"] as const;

type RunnerOptions = {
  profileName: BenchmarkProfileName;
  cacheProfiles: CacheProfile[];
  outputPath?: string;
  databaseUrl?: string;
  authToken?: string;
  allowExternalSeed: boolean;
  gate: boolean;
  warmups?: number;
  repetitions?: number;
};

function argumentValue(argumentsList: string[], name: string) {
  const index = argumentsList.indexOf(name);
  return index === -1 ? undefined : argumentsList[index + 1];
}

function numberArgument(argumentsList: string[], name: string) {
  const value = argumentValue(argumentsList, name);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return parsed;
}

function parseOptions(argumentsList: string[]): RunnerOptions {
  const profileName =
    (argumentValue(argumentsList, "--profile") as
      BenchmarkProfileName | undefined) ?? "representative";
  if (!(profileName in BENCHMARK_PROFILES)) {
    throw new Error(`Unknown benchmark profile: ${profileName}`);
  }
  const cache = argumentValue(argumentsList, "--cache") ?? "all";
  if (!new Set(["warm", "cold", "all"]).has(cache)) {
    throw new Error(`Unknown cache profile: ${cache}`);
  }
  const databaseUrl = argumentValue(argumentsList, "--database-url");
  const allowExternalSeed = argumentsList.includes("--allow-external-seed");
  if (databaseUrl && !databaseUrl.startsWith("file:") && !allowExternalSeed) {
    throw new Error(
      "Remote and turso dev targets require --allow-external-seed; use a dedicated migrated benchmark database",
    );
  }

  return {
    profileName,
    cacheProfiles: cache === "all" ? ["warm", "cold"] : [cache as CacheProfile],
    outputPath: argumentValue(argumentsList, "--output"),
    databaseUrl,
    authToken: argumentValue(argumentsList, "--auth-token"),
    allowExternalSeed,
    gate: argumentsList.includes("--gate"),
    warmups: numberArgument(argumentsList, "--warmups"),
    repetitions: numberArgument(argumentsList, "--repetitions"),
  };
}

function currentGitValue(argumentsList: string[]) {
  return execFileSync("git", argumentsList, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

async function measureOperation(input: {
  databaseUrl: string;
  authToken?: string;
  cache: CacheProfile;
  operation: OperationName;
  userId: string;
  viewId: number;
  visibility: (typeof VISIBILITIES)[number];
  warmSession?: ReturnType<typeof openBenchmarkDatabase>;
}): Promise<OperationSample> {
  const session =
    input.cache === "warm"
      ? input.warmSession!
      : openBenchmarkDatabase({
          url: input.databaseUrl,
          authToken: input.authToken,
        });
  session.instrumentation.reset();
  // Full-collection fixtures are intentionally large enough to provoke GC.
  // Collect between paired samples so an unrelated pause cannot become one
  // operation's p95 while preserving the measured operation itself.
  globalThis.gc?.();
  const beforeMemory = process.memoryUsage();
  const startedAt = performance.now();
  let result:
    | Awaited<ReturnType<typeof queryFeedViewPage>>
    | Awaited<ReturnType<typeof queryMixedViewPage>>;
  let resultRows: number;
  if (input.operation === "feed-view-page") {
    const feedResult = await queryFeedViewPage({
      database: session.database,
      userId: input.userId,
      viewId: input.viewId,
      visibility: input.visibility,
      limit: PAGE_LIMIT,
    });
    result = feedResult;
    resultRows = feedResult.items.length;
  } else {
    const mixedResult = await queryMixedViewPage({
      database: session.database,
      userId: input.userId,
      viewId: input.viewId,
      visibility: input.visibility,
      limit: PAGE_LIMIT,
    });
    result = mixedResult;
    resultRows = mixedResult.references.length;
  }
  const endedAt = performance.now();
  const afterMemory = process.memoryUsage();
  const databaseSnapshot = session.instrumentation.snapshot();
  const sample: OperationSample = {
    operation: input.operation,
    cache: input.cache,
    visibility: input.visibility,
    fullDurationMs: endedAt - startedAt,
    ...databaseSnapshot,
    resultBytes: Buffer.byteLength(JSON.stringify(result)),
    resultRows,
    heapDeltaBytes: afterMemory.heapUsed - beforeMemory.heapUsed,
    rssDeltaBytes: afterMemory.rss - beforeMemory.rss,
  };
  if (input.cache === "cold") session.close();
  return sample;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const profile = BENCHMARK_PROFILES[options.profileName];
  const localTarget = options.databaseUrl
    ? undefined
    : createLocalBenchmarkTarget();
  const databaseUrl = options.databaseUrl ?? localTarget!.url;
  const userId = `serial-benchmark-${randomUUID()}`;
  const setupSession = openBenchmarkDatabase({
    url: databaseUrl,
    authToken: options.authToken,
  });
  if (!options.databaseUrl) await applyMigrations(setupSession.baseClient);
  const fixture = await seedBenchmarkFixture({
    database: setupSession.database,
    profileName: options.profileName,
    userId,
  });
  setupSession.close();

  const samples: OperationSample[] = [];
  try {
    for (const cache of options.cacheProfiles) {
      const warmSession =
        cache === "warm"
          ? openBenchmarkDatabase({
              url: databaseUrl,
              authToken: options.authToken,
            })
          : undefined;
      try {
        for (const visibility of VISIBILITIES) {
          const warmups = options.warmups ?? profile.warmups;
          const repetitions = options.repetitions ?? profile.repetitions;
          for (let index = 0; index < warmups + repetitions; index += 1) {
            const operations: OperationName[] =
              index % 2 === 0
                ? ["feed-view-page", "mixed-view-page"]
                : ["mixed-view-page", "feed-view-page"];
            for (const operation of operations) {
              const sample = await measureOperation({
                databaseUrl,
                authToken: options.authToken,
                cache,
                operation,
                userId,
                viewId: fixture.allContentViewId,
                visibility,
                warmSession,
              });
              if (index >= warmups) samples.push(sample);
            }
          }
        }
      } finally {
        warmSession?.close();
      }
    }

    const comparisons = options.cacheProfiles.flatMap((cache) =>
      VISIBILITIES.map((visibility) => {
        const matching = samples.filter(
          (sample) =>
            sample.cache === cache && sample.visibility === visibility,
        );
        const baseline = summarizeSamples(
          matching.filter((sample) => sample.operation === "feed-view-page"),
        );
        const candidate = summarizeSamples(
          matching.filter((sample) => sample.operation === "mixed-view-page"),
        );
        return {
          cache,
          visibility,
          baseline,
          candidate,
          gate: calculatePairGate({
            baseline,
            candidate,
            pageLimit: PAGE_LIMIT,
          }),
        };
      }),
    );
    const rawSamples = samples.map((sample) => {
      const rawSample = { ...sample };
      Reflect.deleteProperty(rawSample, "statements");
      return rawSample;
    });
    const statementObservations = options.cacheProfiles.flatMap((cache) =>
      VISIBILITIES.flatMap((visibility) =>
        (["feed-view-page", "mixed-view-page"] as const).map((operation) => {
          const sample = samples.find(
            (candidate) =>
              candidate.cache === cache &&
              candidate.visibility === visibility &&
              candidate.operation === operation,
          );
          return {
            cache,
            visibility,
            operation,
            statements: sample!.statements,
          };
        }),
      ),
    );
    const artifact = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      git: {
        commit: currentGitValue(["rev-parse", "HEAD"]),
        branch: currentGitValue(["branch", "--show-current"]),
        workingTreeDirty: currentGitValue(["status", "--porcelain"]).length > 0,
        preBookmarkProductionRef: PRE_BOOKMARK_PRODUCTION_REF,
      },
      target: {
        protocol: databaseUrl.split(":", 1)[0],
        externallyManaged: Boolean(options.databaseUrl),
      },
      profile: { name: options.profileName, ...profile },
      fixture,
      method: {
        pageLimit: PAGE_LIMIT,
        cacheProfiles: options.cacheProfiles,
        warmups: options.warmups ?? profile.warmups,
        repetitions: options.repetitions ?? profile.repetitions,
        pairing: "interleaved with alternating first operation",
        latencyGate: "candidate median and p95 <= baseline * 1.5",
        structuralGate:
          "candidate maximum materialized rows <= baseline maximum + page limit + sentinel",
      },
      comparisons,
      rawSamples,
      statementObservations,
      passed: comparisons.every((comparison) => comparison.gate.passed),
    };

    if (options.outputPath) {
      const outputPath = resolve(options.outputPath);
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(
        outputPath,
        await format(JSON.stringify(artifact), { filepath: outputPath }),
      );
    }
    for (const comparison of comparisons) {
      process.stdout.write(
        `${comparison.cache}/${comparison.visibility}: median ${comparison.gate.latencyMedianRatio.toFixed(2)}x, p95 ${comparison.gate.latencyP95Ratio.toFixed(2)}x, rows ${comparison.gate.structuralRowsObserved}/${comparison.gate.structuralRowBudget}, ${comparison.gate.passed ? "PASS" : "FAIL"}\n`,
      );
    }
    if (options.outputPath) {
      process.stdout.write(`Artifact: ${resolve(options.outputPath)}\n`);
    }
    if (options.gate && !artifact.passed) process.exitCode = 1;
  } finally {
    const cleanupSession = openBenchmarkDatabase({
      url: databaseUrl,
      authToken: options.authToken,
    });
    try {
      await removeBenchmarkFixture({
        database: cleanupSession.database,
        userId,
      });
    } finally {
      cleanupSession.close();
      localTarget?.cleanup();
    }
  }
}

await main();
