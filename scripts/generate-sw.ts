import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { injectManifest } from "workbox-build";

const OUTPUT_DIR = ".output/public";
const SW_SRC = "src/sw.ts";
const SW_DEST = path.join(OUTPUT_DIR, "sw.js");
const DIST_SW_DIR = "dist-sw";

async function generateServiceWorker() {
  console.log("Building service worker...");

  // Ensure dist-sw directory exists
  if (!fs.existsSync(DIST_SW_DIR)) {
    fs.mkdirSync(DIST_SW_DIR, { recursive: true });
  }

  // First, compile TypeScript to JavaScript using esbuild
  const intermediateFile = path.join(DIST_SW_DIR, "sw.js");

  await build({
    entryPoints: [SW_SRC],
    outfile: intermediateFile,
    bundle: true,
    format: "esm",
    minify: true,
    sourcemap: false,
    target: "es2022",
  });

  console.log("TypeScript compiled successfully");

  // Then inject the precache manifest
  const { count, size, warnings } = await injectManifest({
    swSrc: intermediateFile,
    swDest: SW_DEST,
    globDirectory: OUTPUT_DIR,
    globPatterns: [
      "**/*.{js,css,html,ico,png,svg,woff,woff2,webp,jpg,jpeg,gif}",
    ],
    globIgnores: ["sw.js", "workbox-*.js"],
    maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB
  });

  if (warnings.length > 0) {
    console.warn("Warnings during manifest injection:");
    warnings.forEach((warning) => console.warn(`  - ${warning}`));
  }

  console.log(
    `Service worker generated: ${count} files precached (${(size / 1024).toFixed(1)} KB)`,
  );
}

generateServiceWorker().catch((err) => {
  console.error("Error generating service worker:", err);
  process.exit(1);
});
