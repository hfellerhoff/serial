import { randomBytes, randomInt, webcrypto } from "node:crypto";
import { existsSync } from "node:fs";
import net from "node:net";
import { spawn, spawnSync } from "node:child_process";

type TestEnvironment = "main" | "self-hosted" | "demo";

const MIN_FIVE_DIGIT_PORT = 10_000;
const MAX_TCP_PORT = 65_535;
const LOOPBACK_HOSTS = ["127.0.0.1", "::1"] as const;

const environments: Record<
  TestEnvironment,
  {
    config: string;
    appPortVariable: string;
    tursoPortVariable: string;
    rssPortVariable: string;
    additionalPortVariables?: string[];
  }
> = {
  main: {
    config: "playwright.main-instance.config.ts",
    appPortVariable: "SERIAL_TEST_MAIN_APP_PORT",
    tursoPortVariable: "SERIAL_TEST_MAIN_TURSO_PORT",
    rssPortVariable: "SERIAL_TEST_MAIN_RSS_PORT",
  },
  "self-hosted": {
    config: "playwright.self-hosted.config.ts",
    appPortVariable: "SERIAL_TEST_SELF_HOSTED_APP_PORT",
    tursoPortVariable: "SERIAL_TEST_SELF_HOSTED_TURSO_PORT",
    rssPortVariable: "SERIAL_TEST_SELF_HOSTED_RSS_PORT",
    additionalPortVariables: [
      "SERIAL_TEST_SELF_HOSTED_BOOTSTRAP_APP_PORT",
      "SERIAL_TEST_SELF_HOSTED_BOOTSTRAP_TURSO_PORT",
      "SERIAL_TEST_SELF_HOSTED_APPVIEW_PORT",
      "SERIAL_TEST_SELF_HOSTED_CONFIG_APP_PORT",
      "SERIAL_TEST_SELF_HOSTED_CONFIG_TURSO_PORT",
      "SERIAL_TEST_SELF_HOSTED_UNCONFIGURED_APP_PORT",
      "SERIAL_TEST_SELF_HOSTED_UNCONFIGURED_TURSO_PORT",
      "SERIAL_TEST_SELF_HOSTED_EMAIL_PORT",
    ],
  },
  demo: {
    config: "playwright.demo.config.ts",
    appPortVariable: "SERIAL_TEST_DEMO_APP_PORT",
    tursoPortVariable: "SERIAL_TEST_DEMO_TURSO_PORT",
    rssPortVariable: "SERIAL_TEST_DEMO_RSS_PORT",
  },
};

async function findAvailablePort(excludedPorts: Set<number>) {
  while (true) {
    const port = randomInt(MIN_FIVE_DIGIT_PORT, MAX_TCP_PORT + 1);
    if (excludedPorts.has(port)) continue;

    const availability = await Promise.all(
      LOOPBACK_HOSTS.map(
        (host) =>
          new Promise<boolean>((resolve) => {
            const server = net.createServer();
            server.unref();
            server.once("error", () => resolve(false));
            server.listen(port, host, () => {
              server.close(() => resolve(true));
            });
          }),
      ),
    );

    if (availability.every(Boolean)) {
      return port;
    }
  }
}

async function allocatePorts(count: number) {
  const ports: number[] = [];
  const excludedPorts = new Set<number>();

  while (ports.length < count) {
    const port = await findAvailablePort(excludedPorts);
    ports.push(port);
    excludedPorts.add(port);
  }

  return ports;
}

const [environmentName, ...playwrightArguments] = process.argv.slice(2);
if (
  environmentName !== "main" &&
  environmentName !== "self-hosted" &&
  environmentName !== "demo"
) {
  console.error(
    "Usage: run-e2e.ts <main|self-hosted|demo> [...playwright args]",
  );
  process.exit(1);
}

const environment = environments[environmentName];
const additionalPortVariables = environment.additionalPortVariables ?? [];
const [appPort, tursoPort, rssPort, ...additionalPorts] = await allocatePorts(
  3 + additionalPortVariables.length,
);
if (!appPort || !tursoPort || !rssPort) {
  throw new Error("Failed to allocate test ports.");
}

const appUrl = `http://localhost:${appPort}`;
const additionalPortEnvironment = Object.fromEntries(
  additionalPortVariables.map((variable, index) => [
    variable,
    String(additionalPorts[index]),
  ]),
);
// The stub AppView backing the atproto typeahead runs only in the
// self-hosted environment; both its app servers (main and bootstrap) must
// point at it so no spec can reach a real AppView. The atproto key
// material is generated fresh per run rather than committed — no private
// key ever lives in the repo, test-only or otherwise.
async function generateAtprotoTestKeys() {
  const keyPair = await webcrypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign"],
  );
  const jwk = await webcrypto.subtle.exportKey("jwk", keyPair.privateKey);
  return {
    ATPROTO_CLIENT_PRIVATE_KEYS: JSON.stringify([
      { kid: "serial-e2e-atproto", ...jwk },
    ]),
    ATPROTO_STORE_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  };
}

const appviewPort =
  additionalPortEnvironment.SERIAL_TEST_SELF_HOSTED_APPVIEW_PORT;
const appviewEnvironment = appviewPort
  ? {
      ATPROTO_APPVIEW_URL: `http://127.0.0.1:${appviewPort}`,
      SERIAL_TEST_APPVIEW_ALLOW_LOOPBACK: "1",
      SERIAL_TEST_APPVIEW_ORIGIN: `http://127.0.0.1:${appviewPort}`,
      ...(await generateAtprotoTestKeys()),
    }
  : {};

const childEnvironment = {
  ...process.env,
  [environment.appPortVariable]: String(appPort),
  [environment.tursoPortVariable]: String(tursoPort),
  [environment.rssPortVariable]: String(rssPort),
  ...additionalPortEnvironment,
  ...appviewEnvironment,
  DATABASE_URL: `http://127.0.0.1:${tursoPort}`,
  PUBLIC_BASE_URL: appUrl,
  VITE_PUBLIC_BASE_URL: appUrl,
  SERIAL_TEST_RSS_ALLOW_LOOPBACK: "1",
  SERIAL_TEST_RSS_ORIGIN: `http://127.0.0.1:${rssPort}`,
  SERIAL_E2E_FAULT_CONTROLS: "1",
  PORT: String(appPort),
};

const allocatedPortEnvironment = {
  [environment.appPortVariable]: appPort,
  [environment.tursoPortVariable]: tursoPort,
  [environment.rssPortVariable]: rssPort,
  ...Object.fromEntries(
    additionalPortVariables.map((variable, index) => [
      variable,
      additionalPorts[index],
    ]),
  ),
};

console.log(`SERIAL_E2E_PORTS=${JSON.stringify(allocatedPortEnvironment)}`);

if (process.env.SERIAL_CLIENT_PERFORMANCE_PRODUCTION === "1") {
  if (process.env.SERIAL_E2E_REUSE_BUILD === "1") {
    if (!existsSync(".output/server/index.mjs")) {
      console.error(
        "SERIAL_E2E_REUSE_BUILD=1 requires an existing production build.",
      );
      process.exit(1);
    }
  } else {
    const build = spawnSync("pnpm", ["build:atomic"], {
      env: childEnvironment,
      stdio: "inherit",
    });
    if (build.signal) {
      process.kill(process.pid, build.signal);
    }
    if (build.status !== 0) {
      process.exit(build.status ?? 1);
    }
  }
}

let supervisorReady = false;
let pendingSignal: NodeJS.Signals | undefined;
const forwardedSignals = ["SIGINT", "SIGTERM", "SIGHUP"] as const;
const signalHandlers = new Map<NodeJS.Signals, () => void>();

const supervisor = spawn(
  process.execPath,
  [
    "--import=tsx",
    "scripts/supervise-e2e.ts",
    String(process.pid),
    environment.config,
    ...playwrightArguments,
  ],
  {
    env: childEnvironment,
    stdio: ["inherit", "inherit", "inherit", "ipc"],
  },
);

for (const signal of forwardedSignals) {
  const handler = () => {
    pendingSignal ??= signal;
    if (!supervisorReady) return;
    try {
      supervisor.kill(signal);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  };
  signalHandlers.set(signal, handler);
  process.on(signal, handler);
}

supervisor.on("message", (message: unknown) => {
  if (
    typeof message !== "object" ||
    message === null ||
    !("type" in message) ||
    message.type !== "ready"
  ) {
    return;
  }
  supervisorReady = true;
  if (pendingSignal) {
    try {
      supervisor.kill(pendingSignal);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  }
});

supervisor.once("exit", (code, signal) => {
  for (const [forwardedSignal, handler] of signalHandlers) {
    process.off(forwardedSignal, handler);
  }

  const exitSignal = signal ?? pendingSignal;
  if (exitSignal) {
    process.kill(process.pid, exitSignal);
  } else {
    process.exitCode = code ?? 1;
  }
});
