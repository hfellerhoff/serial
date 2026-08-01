import { parseArgs } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  evaluateClientAuditOperationBudgets,
  runClientAuditProfile,
} from "./client-audit-model";
import { BENCHMARK_PROFILES } from "./model";
import type { BenchmarkProfileName } from "./model";

const { values } = parseArgs({
  options: {
    profile: { type: "string", default: "representative" },
    output: { type: "string" },
    gate: { type: "boolean", default: false },
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

if (values.gate) {
  const violations = evaluateClientAuditOperationBudgets(result);
  if (violations.length > 0) {
    process.stderr.write(
      `Client performance budget failures:\n${violations.join("\n")}\n`,
    );
    process.exitCode = 1;
  }
}
