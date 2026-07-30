import net from "node:net";
import { spawn } from "node:child_process";

const STARTUP_TIMEOUT_MS = 30_000;
const DEMO_URL_PATTERN = /Demo app:\s+(https?:\/\/\S+)/;
const extensionScriptsByBrowser = {
  chrome: "dev:chrome",
  firefox: "dev:firefox",
};

const browser = process.argv[2] ?? "chrome";
const extensionScript = extensionScriptsByBrowser[browser];

if (!extensionScript) {
  console.error(
    `Unsupported demo browser "${browser}". Choose "chrome" or "firefox".`,
  );
  process.exit(1);
}

let extensionProcess;
let isStopping = false;

const appProcess = spawn("pnpm", ["--filter", "@serial/app", "dev:demo"], {
  stdio: ["inherit", "pipe", "inherit"],
});

function stop(signal = "SIGTERM") {
  if (isStopping) return;
  isStopping = true;
  extensionProcess?.kill(signal);
  appProcess.kill(signal);
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

function waitForDemoUrl() {
  return new Promise((resolve, reject) => {
    let output = "";

    const finish = (callback) => {
      clearTimeout(timeout);
      appProcess.off("error", onError);
      appProcess.off("exit", onExit);
      callback();
    };

    const onData = (chunk) => {
      process.stdout.write(chunk);
      output += chunk.toString();

      const match = output.match(DEMO_URL_PATTERN);
      if (!match) return;

      appProcess.stdout.off("data", onData);
      appProcess.stdout.pipe(process.stdout);
      finish(() => resolve(match[1]));
    };

    const onError = (error) => finish(() => reject(error));
    const onExit = (code) =>
      finish(() =>
        reject(
          new Error(
            `Demo process exited before announcing its URL (code ${code}).`,
          ),
        ),
      );

    const timeout = setTimeout(() => {
      appProcess.stdout.off("data", onData);
      finish(() => reject(new Error("Timed out waiting for the demo URL.")));
    }, STARTUP_TIMEOUT_MS);

    appProcess.stdout.on("data", onData);
    appProcess.once("error", onError);
    appProcess.once("exit", onExit);
  });
}

function waitForPort(appUrl) {
  const { hostname, port } = new URL(appUrl);

  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearInterval(interval);
      clearTimeout(timeout);
      appProcess.off("exit", onExit);
      callback();
    };

    const check = () => {
      const socket = net.createConnection({
        host: hostname,
        port: Number(port),
      });
      socket.once("connect", () => {
        socket.destroy();
        finish(resolve);
      });
      socket.once("error", () => socket.destroy());
    };

    const onExit = (code) =>
      finish(() =>
        reject(new Error(`Demo process exited before startup (code ${code}).`)),
      );

    const interval = setInterval(check, 100);
    const timeout = setTimeout(() => {
      finish(() => reject(new Error("Timed out starting the demo app.")));
    }, STARTUP_TIMEOUT_MS);

    appProcess.once("exit", onExit);
    check();
  });
}

try {
  const appUrl = await waitForDemoUrl();
  await waitForPort(appUrl);

  console.log(`Opening extension in ${browser} at ${appUrl}`);
  extensionProcess = spawn(
    "pnpm",
    ["--filter", "@serial/extension", extensionScript],
    {
      env: {
        ...process.env,
        SERIAL_EXTENSION_START_URL: appUrl,
      },
      stdio: "inherit",
    },
  );

  appProcess.once("exit", (code, signal) => {
    if (isStopping) return;
    process.exitCode = code ?? (signal ? 0 : 1);
    stop();
  });

  extensionProcess.once("error", (error) => {
    if (isStopping) return;
    console.error(`Unable to start the extension: ${error.message}`);
    process.exitCode = 1;
    stop();
  });

  extensionProcess.once("exit", (code, signal) => {
    if (isStopping) return;
    process.exitCode = code ?? (signal ? 0 : 1);
    stop();
  });
} catch (error) {
  if (!isStopping) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
    stop();
  }
}
