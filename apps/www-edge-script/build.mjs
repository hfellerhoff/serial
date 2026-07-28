import { build } from "esbuild";

await build({
  bundle: true,
  conditions: ["deno", "import"],
  entryPoints: ["src/main.ts"],
  format: "esm",
  outfile: "dist/index.js",
  platform: "neutral",
  target: "es2022",
});
