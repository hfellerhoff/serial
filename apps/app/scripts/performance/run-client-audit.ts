import { parseArgs } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { runClientAuditProfile } from "./client-audit-model";
import { BENCHMARK_PROFILES } from "./model";
import type { BenchmarkProfileName } from "./model";

const { values } = parseArgs({
  options: {
    profile: { type: "string", default: "representative" },
    output: { type: "string" },
  },
});

if (!(values.profile in BENCHMARK_PROFILES)) {
  throw new Error(`Unknown client audit profile: ${values.profile}`);
}

const result = runClientAuditProfile(values.profile as BenchmarkProfileName);
const serialized = `${JSON.stringify(result, null, 2)}\n`;
if (values.output) {
  const outputPath = path.resolve(values.output);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serialized, "utf8");
}
process.stdout.write(serialized);
