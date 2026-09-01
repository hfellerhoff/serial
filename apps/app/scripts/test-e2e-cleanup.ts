import { spawn, spawnSync } from "node:child_process";
import net from "node:net";

const STARTUP_TIMEOUT_MS = 150_000;
const CLEANUP_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 100;
const REPETITIONS_PER_SIGNAL = 2;
const expectedPortVariables = [
  "SERIAL_TEST_SELF_HOSTED_APP_PORT",
  "SERIAL_TEST_SELF_HOSTED_TURSO_PORT",
  "SERIAL_TEST_SELF_HOSTED_RSS_PORT",
  "SERIAL_TEST_SELF_HOSTED_BOOTSTRAP_APP_PORT",
  "SERIAL_TEST_SELF_HOSTED_BOOTSTRAP_TURSO_PORT",
] as const;

type ProcessRow = {
  pid: number;
  parentPid: number;
  processGroupId: number;
  command: string;
};

type ExitResult = {
  code: number | null;
  signal: NodeJS.Signals | null;
};

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function readProcessTable() {
  const result = spawnSync("ps", ["-axo", "pid=,ppid=,pgid=,command="], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`Failed to inspect processes: ${result.stderr}`);
  }

  return result.stdout
    .split("\n")
    .map((line): ProcessRow | undefined => {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);
      if (!match) return undefined;
      return {
        pid: Number(match[1]),
        parentPid: Number(match[2]),
        processGroupId: Number(match[3]),
        command: match[4] ?? "",
      };
    })
    .filter((row): row is ProcessRow => row !== undefined);
}

function collectDescendants(processes: ProcessRow[], rootPid: number) {
  const descendantPids = new Set([rootPid]);
  let foundNewDescendant = true;
  while (foundNewDescendant) {
    foundNewDescendant = false;
    for (const process of processes) {
      if (
        descendantPids.has(process.parentPid) &&
        !descendantPids.has(process.pid)
      ) {
        descendantPids.add(process.pid);
        foundNewDescendant = true;
      }
    }
  }
  descendantPids.delete(rootPid);
  return processes.filter((process) => descendantPids.has(process.pid));
}

async function canBind(port: number, host: string) {
  return new Promise<boolean>((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen({ host, port, exclusive: true }, () => {
      server.close(() => resolve(true));
    });
  });
}

async function arePortsAvailable(ports: number[]) {
  const availability = await Promise.all(
    ports.flatMap((port) => [canBind(port, "127.0.0.1"), canBind(port, "::1")]),
  );
  return availability.every(Boolean);
}

function parsePorts(output: string) {
  const match = output.match(/^SERIAL_E2E_PORTS=(\{.+\})$/m);
  if (!match?.[1]) return undefined;
  const parsed = JSON.parse(match[1]) as Record<string, unknown>;
  const ports = expectedPortVariables.map((variable) => parsed[variable]);
  if (
    ports.some(
      (port) =>
        typeof port !== "number" || !Number.isInteger(port) || port <= 0,
    )
  ) {
    throw new Error(`Invalid E2E port report: ${match[1]}`);
  }
  return ports as number[];
}

function parseProcessGroupIds(output: string) {
  return [
    ...new Set(
      [
        ...output.matchAll(
          /SERIAL_E2E_(?:PROCESS_GROUP|SERVER_PROCESS_GROUP)=(\d+)/g,
        ),
      ].map((match) => Number(match[1])),
    ),
  ];
}

async function waitForReady(
  output: () => string,
  launcher: ReturnType<typeof spawn>,
) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const currentOutput = output();
    const ports = parsePorts(currentOutput);
    const processGroupIds = parseProcessGroupIds(currentOutput);
    if (
      ports &&
      processGroupIds.length >= 4 &&
      currentOutput.includes("SERIAL_E2E_CLEANUP_READY")
    ) {
      return { ports, processGroupIds };
    }
    if (launcher.exitCode !== null || launcher.signalCode !== null) {
      throw new Error(
        `E2E launcher exited before the cleanup probe was ready.\n${currentOutput}`,
      );
    }
    await delay(POLL_INTERVAL_MS);
  }
  throw new Error(`Timed out waiting for the E2E cleanup probe.\n${output()}`);
}

function assertExpectedServices(processes: ProcessRow[], ports: number[]) {
  const processCommands = processes
    .map((process) => process.command)
    .join("\n");
  const [appPort, tursoPort, rssPort, bootstrapAppPort, bootstrapTursoPort] =
    ports;
  const expectedFragments = [
    `NODE_ENV=production PORT=${appPort} pnpm start`,
    `turso dev --db-file serial-test-self-hosted.db --port ${tursoPort}`,
    `rss-server.ts ${rssPort}`,
    `NODE_ENV=production PORT=${bootstrapAppPort} pnpm start`,
    `turso dev --db-file serial-test-self-hosted-bootstrap.db --port ${bootstrapTursoPort}`,
  ];
  const missingFragments = expectedFragments.filter(
    (fragment) => !processCommands.includes(fragment),
  );
  if (missingFragments.length > 0) {
    throw new Error(
      `Cleanup probe did not start the expected services: ${missingFragments.join(", ")}\n${processCommands}`,
    );
  }
}

async function waitForCleanup(
  observedProcesses: ProcessRow[],
  processGroupIds: number[],
  ports: number[],
) {
  const deadline = Date.now() + CLEANUP_TIMEOUT_MS;
  let remainingObserved: ProcessRow[] = [];
  let remainingGroup: ProcessRow[] = [];
  let portsAvailable = false;

  while (Date.now() < deadline) {
    const processes = readProcessTable();
    const currentByPid = new Map(
      processes.map((process) => [process.pid, process]),
    );
    remainingObserved = observedProcesses.filter((observed) => {
      const current = currentByPid.get(observed.pid);
      return current?.command === observed.command;
    });
    remainingGroup = processes.filter((process) =>
      processGroupIds.includes(process.processGroupId),
    );
    portsAvailable = await arePortsAvailable(ports);

    if (
      remainingObserved.length === 0 &&
      remainingGroup.length === 0 &&
      portsAvailable
    ) {
      return;
    }
    await delay(POLL_INTERVAL_MS);
  }

  throw new Error(
    [
      `E2E cleanup did not finish within ${CLEANUP_TIMEOUT_MS}ms.`,
      `Remaining observed processes:\n${remainingObserved.map((process) => JSON.stringify(process)).join("\n") || "none"}`,
      `Remaining process-group members:\n${remainingGroup.map((process) => JSON.stringify(process)).join("\n") || "none"}`,
      `Ports available: ${portsAvailable}`,
    ].join("\n"),
  );
}

async function runCancellationCase(signal: "SIGTERM" | "SIGKILL", run: number) {
  console.log(`E2E cleanup probe: ${signal} run ${run}`);
  const launcher = spawn(
    process.execPath,
    ["--import=tsx", "scripts/run-e2e.ts", "self-hosted"],
    {
      env: {
        ...process.env,
        PLAYWRIGHT_HTML_OPEN: "never",
        SERIAL_CLIENT_PERFORMANCE_PRODUCTION: "1",
        SERIAL_E2E_CLEANUP_PROBE: "1",
        SERIAL_E2E_REUSE_BUILD: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (!launcher.pid) throw new Error("Failed to start the E2E launcher.");

  let combinedOutput = "";
  launcher.stdout?.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    combinedOutput += text;
    process.stdout.write(text);
  });
  launcher.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    combinedOutput += text;
    process.stderr.write(text);
  });
  const launcherExit = new Promise<ExitResult>((resolve) => {
    launcher.once("exit", (code, exitSignal) =>
      resolve({ code, signal: exitSignal }),
    );
  });

  let cancellationSent = false;
  try {
    const { ports, processGroupIds } = await waitForReady(
      () => combinedOutput,
      launcher,
    );
    const processes = readProcessTable();
    const observedProcesses = collectDescendants(processes, launcher.pid);
    assertExpectedServices(observedProcesses, ports);

    cancellationSent = launcher.kill(signal);
    if (!cancellationSent) {
      throw new Error(
        `Failed to send ${signal} to E2E launcher ${launcher.pid}.`,
      );
    }

    const exit = await launcherExit;
    if (exit.signal !== signal) {
      throw new Error(
        `E2E launcher exited with code ${exit.code} and signal ${exit.signal}; expected ${signal}.`,
      );
    }
    await waitForCleanup(observedProcesses, processGroupIds, ports);
  } catch (error) {
    if (!cancellationSent && launcher.exitCode === null) {
      launcher.kill("SIGTERM");
      await Promise.race([launcherExit, delay(CLEANUP_TIMEOUT_MS)]);
    }
    throw new Error(`${String(error)}\n${combinedOutput}`, { cause: error });
  }
}

if (process.platform === "win32") {
  throw new Error("The E2E cleanup regression requires POSIX process groups.");
}

for (let run = 1; run <= REPETITIONS_PER_SIGNAL; run += 1) {
  await runCancellationCase("SIGTERM", run);
  await runCancellationCase("SIGKILL", run);
}

console.log("E2E cleanup probes passed.");
