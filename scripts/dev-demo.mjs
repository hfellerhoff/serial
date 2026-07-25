import { randomInt } from "node:crypto";
import net from "node:net";
import { spawn } from "node:child_process";

const MIN_FIVE_DIGIT_PORT = 10_000;
const MAX_TCP_PORT = 65_535;

async function findAvailablePort(excludedPorts = new Set()) {
  while (true) {
    const port = randomInt(MIN_FIVE_DIGIT_PORT, MAX_TCP_PORT + 1);
    if (excludedPorts.has(port)) continue;

    const isAvailable = await new Promise((resolve) => {
      const server = net.createServer();
      server.unref();
      server.once("error", () => resolve(false));
      server.listen(port, () => {
        server.close(() => resolve(true));
      });
    });

    if (isAvailable) return port;
  }
}

function waitForPort(port, process) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearInterval(interval);
      clearTimeout(timeout);
      process.off("exit", onExit);
      callback();
    };

    const check = () => {
      const socket = net.createConnection({ host: "127.0.0.1", port });
      socket.once("connect", () => {
        socket.destroy();
        finish(resolve);
      });
      socket.once("error", () => socket.destroy());
    };

    const onExit = (code) => {
      finish(() =>
        reject(
          new Error(`Demo database exited before startup (code ${code}).`),
        ),
      );
    };

    const interval = setInterval(check, 100);
    const timeout = setTimeout(() => {
      finish(() => reject(new Error("Timed out starting the demo database.")));
    }, 15_000);

    process.once("exit", onExit);
    check();
  });
}

const appPort = await findAvailablePort();
const databasePort = await findAvailablePort(new Set([appPort]));
const demoEnvironment = {
  ...process.env,
  PUBLIC_BASE_URL: `http://localhost:${appPort}`,
  PUBLIC_IS_MAIN_INSTANCE: "false",
  BETTER_AUTH_SECRET: "serial-demo-local-development-secret",
  DATABASE_URL: `http://127.0.0.1:${databasePort}`,
  KV_STORE: "none",
};

console.log(`Demo app:      http://localhost:${appPort}`);
console.log(`Demo database: http://127.0.0.1:${databasePort}`);

const databaseProcess = spawn(
  "pnpm",
  [
    "exec",
    "turso",
    "dev",
    "--db-file",
    "serial-demo.db",
    "--port",
    String(databasePort),
  ],
  {
    env: demoEnvironment,
    stdio: "inherit",
  },
);

let appProcess;
let isStopping = false;

function stop(signal = "SIGTERM") {
  if (isStopping) return;
  isStopping = true;
  appProcess?.kill(signal);
  databaseProcess.kill(signal);
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

try {
  await waitForPort(databasePort, databaseProcess);

  appProcess = spawn(
    "sh",
    [
      "-c",
      "pnpm dev:migrate && exec env NODE_OPTIONS='--import ./instrument.server.mjs' pnpm exec vite dev --mode demo --port \"$SERIAL_DEMO_APP_PORT\" --strictPort",
    ],
    {
      env: {
        ...demoEnvironment,
        SERIAL_DEMO_APP_PORT: String(appPort),
      },
      stdio: "inherit",
    },
  );

  appProcess.once("exit", (code, signal) => {
    stop();
    if (!signal) process.exitCode = code ?? 1;
  });

  databaseProcess.once("exit", (code, signal) => {
    if (isStopping) return;
    console.error(
      `Demo database stopped unexpectedly${signal ? ` (${signal})` : ` (code ${code})`}.`,
    );
    stop();
    process.exitCode = code ?? 1;
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  stop();
  process.exitCode = 1;
}
