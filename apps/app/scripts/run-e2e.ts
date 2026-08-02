import { randomInt } from "node:crypto";
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
const [appPort, tursoPort, rssPort] = await allocatePorts(3);
if (!appPort || !tursoPort || !rssPort) {
  throw new Error("Failed to allocate test ports.");
}

const appUrl = `http://localhost:${appPort}`;
const childEnvironment = {
  ...process.env,
  [environment.appPortVariable]: String(appPort),
  [environment.tursoPortVariable]: String(tursoPort),
  [environment.rssPortVariable]: String(rssPort),
  DATABASE_URL: `http://127.0.0.1:${tursoPort}`,
  PUBLIC_BASE_URL: appUrl,
  VITE_PUBLIC_BASE_URL: appUrl,
  SERIAL_TEST_RSS_ORIGIN: `http://127.0.0.1:${rssPort}`,
  PORT: String(appPort),
};

console.log(
  `${environmentName} test ports: app=${appPort}, db=${tursoPort}, rss=${rssPort}`,
);

if (process.env.SERIAL_CLIENT_PERFORMANCE_PRODUCTION === "1") {
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

const playwright = spawn(
  "pnpm",
  [
    "exec",
    "playwright",
    "test",
    "--config",
    environment.config,
    ...playwrightArguments,
  ],
  {
    env: childEnvironment,
    stdio: "inherit",
  },
);

playwright.once("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
