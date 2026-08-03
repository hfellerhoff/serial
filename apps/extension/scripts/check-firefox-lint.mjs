const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);

let report;
try {
  report = JSON.parse(Buffer.concat(chunks).toString("utf8"));
} catch (error) {
  throw new Error("Firefox lint did not produce a JSON report", {
    cause: error,
  });
}

const expectedWarnings = new Map([
  ["UNSAFE_VAR_ASSIGNMENT:content-scripts/bookmark-capture.js", 3],
  ["UNSAFE_VAR_ASSIGNMENT:chunks/popup", 2],
]);
const actualWarnings = new Map();

for (const warning of report.warnings ?? []) {
  const file = warning.file?.startsWith("chunks/popup-")
    ? "chunks/popup"
    : warning.file;
  const key = `${warning.code}:${file}`;
  actualWarnings.set(key, (actualWarnings.get(key) ?? 0) + 1);
}

const failures = [];
if (report.summary?.errors !== 0) {
  failures.push(
    `expected 0 errors, found ${report.summary?.errors ?? "unknown"}`,
  );
}
if (report.summary?.notices !== 0) {
  failures.push(
    `expected 0 notices, found ${report.summary?.notices ?? "unknown"}`,
  );
}
for (const [key, count] of expectedWarnings) {
  if (actualWarnings.get(key) !== count) {
    failures.push(
      `expected ${count} ${key} warnings, found ${actualWarnings.get(key) ?? 0}`,
    );
  }
}
for (const [key, count] of actualWarnings) {
  if (!expectedWarnings.has(key)) {
    failures.push(`unexpected warning ${key} (${count})`);
  }
}

if (failures.length > 0) {
  throw new Error(
    `Firefox lint validation failed:\n- ${failures.join("\n- ")}`,
  );
}

console.log(
  `Firefox lint passed with ${report.summary.warnings} reviewed third-party warnings.`,
);
