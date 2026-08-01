import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { format } from "prettier";
import ts from "typescript";

const OUTPUT_PATH = resolve("benchmarks/app-query-inventory.json");
const DATABASE_METHODS = new Set([
  "batch",
  "createClient",
  "delete",
  "drizzle",
  "execute",
  "executeMultiple",
  "findFirst",
  "findMany",
  "insert",
  "migrate",
  "select",
  "transaction",
  "update",
]);

type InventoryEntry = {
  file: string;
  area: string;
  symbol: string;
  line: number;
  method: string;
  expression: string;
};

function areaFor(file: string) {
  if (file.includes("/tests/")) return "test-only infrastructure";
  if (file.includes("/routers/admin/")) return "administration";
  if (file.includes("/auth/") || file.includes("api/extension-auth")) {
    return "authentication";
  }
  if (
    file.includes("/rss/") ||
    file.includes("/server/scripts/") ||
    file.includes("/server/tasks/")
  ) {
    return "background and maintenance tasks";
  }
  if (file.includes("mixed-content")) return "synchronization and projection";
  if (file.includes("bookmarks") || file.includes("extension.bookmarks")) {
    return "Bookmark and capture";
  }
  if (file.includes("/routers/")) return "request procedures";
  if (file.includes("/db/")) return "database infrastructure";
  return "application support";
}

function enclosingSymbol(node: ts.Node) {
  let current: ts.Node | undefined = node;
  while (current) {
    if (ts.isFunctionDeclaration(current) && current.name) {
      return current.name.text;
    }
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) {
      return current.name.text;
    }
    if (ts.isMethodDeclaration(current) && current.name) {
      return current.name.getText();
    }
    current = current.parent;
  }
  return "<module>";
}

function isDatabaseAccess(expression: ts.CallExpression) {
  const called = expression.expression;
  const method = ts.isPropertyAccessExpression(called)
    ? called.name.text
    : ts.isIdentifier(called)
      ? called.text
      : "";
  if (!DATABASE_METHODS.has(method)) return false;
  const text = called.getText().replaceAll(/\s/g, "");
  if (method === "createClient" || method === "drizzle") return true;
  return /(^|\.)(client|db|database|tx)(\.|$)/.test(text);
}

function inventoryFile(filePath: string) {
  const content = readFileSync(filePath, "utf8");
  const source = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const workspaceFile = relative(resolve("."), filePath).replaceAll("\\", "/");
  const entries: InventoryEntry[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && isDatabaseAccess(node)) {
      const called = node.expression;
      const method = ts.isPropertyAccessExpression(called)
        ? called.name.text
        : called.getText();
      entries.push({
        file: workspaceFile,
        area: areaFor(`/${workspaceFile}`),
        symbol: enclosingSymbol(node),
        line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        method,
        expression: called.getText(),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return entries;
}

function buildInventory() {
  const files = execFileSync(
    "rg",
    [
      "--files",
      "src",
      "server",
      "tests",
      "scripts",
      "-g",
      "*.ts",
      "-g",
      "*.tsx",
      "-g",
      "!src/server/db/migrations/**",
    ],
    { encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((file) => resolve(file))
    .sort();
  const entries = files
    .flatMap(inventoryFile)
    .sort((left, right) =>
      `${left.file}:${left.line}:${left.expression}`.localeCompare(
        `${right.file}:${right.line}:${right.expression}`,
      ),
    );
  const areas = Object.fromEntries(
    [...new Set(entries.map((entry) => entry.area))]
      .sort()
      .map((area) => [
        area,
        entries.filter((entry) => entry.area === area).length,
      ]),
  );
  return {
    schemaVersion: 1,
    scope: [
      "src/**/*.ts(x)",
      "server/**/*.ts(x)",
      "tests/**/*.ts(x)",
      "scripts/**/*.ts(x)",
    ],
    exclusions: ["node_modules", "src/server/db/migrations"],
    accessCount: entries.length,
    areas,
    entries,
  };
}

const inventory = buildInventory();
const serialized = await format(JSON.stringify(inventory), {
  filepath: OUTPUT_PATH,
});
if (process.argv.includes("--check")) {
  if (inventory.accessCount === 0) {
    process.stderr.write("App query inventory found no database accesses.\n");
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `Checked ${inventory.accessCount} direct database accesses from current source.\n`,
    );
  }
} else {
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, serialized);
  process.stdout.write(`${OUTPUT_PATH}\n`);
}
