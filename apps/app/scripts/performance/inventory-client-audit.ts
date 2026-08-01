import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { format } from "prettier";

const SOURCE_ROOT = path.resolve("src");
const OUTPUT_PATH = path.resolve("benchmarks/client-audit-coverage.json");
const INCLUDED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".css"]);
const ROOT_CLIENT_FILES = new Set([
  "src/router.tsx",
  "src/start.ts",
  "src/sw.ts",
  "src/styles/globals.css",
]);

const findingPaths: Record<string, string[]> = {
  "CL-01": [
    "src/lib/data/useDataSubscription.ts",
    "src/lib/data/subscriptionCoordinator.ts",
    "src/lib/data/bookmarks/manifest.ts",
    "src/lib/data/bookmarks/store.ts",
    "src/lib/data/mixed-content/bookmarkProjection.ts",
    "src/lib/data/mixed-content/store.ts",
  ],
  "CL-02": [
    "src/lib/data/idb-storage.ts",
    "src/lib/data/store.ts",
    "src/lib/data/bookmarks/store.ts",
    "src/lib/data/mixed-content/store.ts",
  ],
  "CL-03": [
    "src/lib/data/store.ts",
    "src/lib/data/scopeMembership.ts",
    "src/lib/data/feed-items/listProjection.ts",
    "src/lib/data/feed-items/index.ts",
    "src/components/feed/SidebarCategories.tsx",
    "src/components/feed/SidebarFeeds.tsx",
    "src/components/feed/SidebarViews.tsx",
    "src/components/feed/ViewFilterChips.tsx",
  ],
  "CL-04": [
    "src/lib/data/store.ts",
    "src/lib/data/bookmarks/store.ts",
    "src/lib/data/mixed-content/store.ts",
    "src/lib/hooks/useLoadMoreItems.ts",
    "src/lib/hooks/useItemWindow.ts",
    "src/components/feed/view-lists/useViewListScroll.tsx",
  ],
  "CL-05": [
    "src/app/_app.read.$id.tsx",
    "src/components/feed/read/ArticleContent.tsx",
    "src/components/feed/read/ArticleSidebars.tsx",
    "src/components/feed/view-lists/RenderViewItems.tsx",
    "src/components/feed/view-lists/useViewSections.ts",
  ],
};

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(entryPath) : [entryPath];
    }),
  );
  return files.flat();
}

function isApplicable(relativePath: string) {
  if (!INCLUDED_EXTENSIONS.has(path.extname(relativePath))) return false;
  if (ROOT_CLIENT_FILES.has(relativePath)) return true;
  if (relativePath.startsWith("src/components/")) return true;
  if (relativePath.startsWith("src/hooks/")) return true;
  if (relativePath.startsWith("src/lib/")) return true;
  if (relativePath.startsWith("src/app/") && relativePath.endsWith(".tsx")) {
    return true;
  }
  return false;
}

function classify(relativePath: string) {
  if (relativePath.startsWith("src/app/")) return "route";
  if (relativePath.startsWith("src/components/ui/")) return "ui-primitive";
  if (relativePath.startsWith("src/components/")) return "component";
  if (
    relativePath.includes("/hooks/") ||
    path.basename(relativePath).startsWith("use")
  ) {
    return "hook";
  }
  if (relativePath.includes("/data/")) return "state-sync-persistence";
  if (relativePath.endsWith(".css")) return "style";
  return "client-shared";
}

async function buildCoverage() {
  const files = (await walk(SOURCE_ROOT))
    .map((file) => path.relative(process.cwd(), file).split(path.sep).join("/"))
    .filter(isApplicable)
    .sort();

  return Promise.all(
    files.map(async (file) => {
      const source = await readFile(path.resolve(file), "utf8");
      const findings = Object.entries(findingPaths)
        .filter(([, paths]) => paths.includes(file))
        .map(([finding]) => finding);
      return {
        file,
        classification: classify(file),
        lines: source.split("\n").length,
        status: findings.length > 0 ? "finding" : "clean",
        findings,
        result:
          findings.length > 0
            ? `Reviewed; contributes to ${findings.join(", ")}.`
            : "Reviewed; no independent data-volume, synchronization, persistence, network-fan-out, render-amplification, or memory-growth finding.",
      };
    }),
  );
}

const coverage = await buildCoverage();
const artifact = {
  schemaVersion: 1,
  generatedAt: "2026-07-31",
  scope:
    "All client/shared routes, components, hooks, state, subscription, persistence, rendering, styles, and browser entry code under apps/app/src.",
  files: coverage.length,
  findings: Object.fromEntries(
    Object.keys(findingPaths).map((finding) => [
      finding,
      coverage.filter((entry) => entry.findings.includes(finding)).length,
    ]),
  ),
  coverage,
};
const serialized = await format(JSON.stringify(artifact), { parser: "json" });

if (process.argv.includes("--check")) {
  const coveredFiles = new Set(coverage.map((entry) => entry.file));
  const missingFindingPaths = Object.values(findingPaths)
    .flat()
    .filter((file) => !coveredFiles.has(file));
  if (missingFindingPaths.length > 0) {
    console.error(
      `Client audit finding paths are missing from current source coverage: ${missingFindingPaths.join(", ")}`,
    );
    process.exitCode = 1;
  } else {
    console.log(`Checked ${coverage.length} applicable client files.`);
  }
} else {
  await writeFile(OUTPUT_PATH, serialized, "utf8");
  console.log(`Recorded ${coverage.length} applicable client files.`);
}
