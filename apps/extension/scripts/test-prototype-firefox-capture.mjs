// PROTOTYPE: disposable Firefox validation for authenticated feed-item capture.
import { spawn } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const STARTUP_TIMEOUT_MS = 45_000;
const ASSERTION_TIMEOUT_MS = 20_000;
const AUTH_COOKIE = "serial_firefox_fixture=authenticated";
const ITEM_ID = "prototype-firefox-auth-item";
const AUTH_MARKER = "FIREFOX_AUTH_ONLY_CAPTURE_BODY";
const FEED_TEASER = "FIREFOX_FEED_TEASER";
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const extensionDirectory = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(extensionDirectory, "../..");
const extensionBuildDirectory = path.join(
  extensionDirectory,
  ".output/firefox-mv2",
);

const children = new Set();
let interrupted = false;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function track(child) {
  children.add(child);
  child.once("exit", () => children.delete(child));
  return child;
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(3_000),
  ]);
  if (child.exitCode === null && child.signalCode === null)
    child.kill("SIGKILL");
}

async function stopChildren() {
  await Promise.all([...children].map(stopChild));
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    interrupted = true;
    void stopChildren().finally(() => process.exit(130));
  });
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = track(
      spawn(command, args, {
        cwd: repositoryRoot,
        env: process.env,
        stdio: "inherit",
        ...options,
      }),
    );
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `${command} exited ${signal ? `with ${signal}` : `with code ${code}`}`,
          ),
        );
    });
  });
}

async function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Unable to allocate a local port"));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}

async function findFirefoxBinary() {
  const candidates = [
    process.env.FIREFOX_BINARY,
    "/Applications/Firefox.app/Contents/MacOS/firefox",
    "/usr/bin/firefox",
    "/usr/local/bin/firefox",
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next conventional location.
    }
  }
  throw new Error(
    "Firefox was not found. Install Firefox or set FIREFOX_BINARY to its executable.",
  );
}

function fixtureHtml(authenticated) {
  if (!authenticated) {
    return `<!doctype html><html><body><main>
      <h1>Protected Firefox fixture</h1>
      <p>Sign in to read the complete article.</p>
      <a id="sign-in" href="/authenticate">Sign in</a>
    </main></body></html>`;
  }

  const paragraphs = Array.from(
    { length: 8 },
    (_, index) =>
      `<p>${AUTH_MARKER} paragraph ${index + 1}. This authenticated article contains enough complete prose for the shared Bookmark readability extractor to select the article body reliably in Firefox. The sentence is deliberately descriptive so a successful capture cannot be confused with the short signed-out teaser.</p>`,
  ).join("");
  return `<!doctype html><html><head><title>Authenticated Firefox Capture</title></head><body>
    <article><h1>Authenticated Firefox Capture</h1><p>By Serial Fixture</p>${paragraphs}</article>
  </body></html>`;
}

async function startFixtureServer() {
  const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    if (requestUrl.pathname === "/authenticate") {
      response.writeHead(302, {
        Location: "/article",
        "Set-Cookie": `${AUTH_COOKIE}; Path=/; HttpOnly; SameSite=Lax`,
      });
      response.end();
      return;
    }

    const authenticated =
      request.headers.cookie?.includes(AUTH_COOKIE) ?? false;
    if (requestUrl.pathname === "/article" && authenticated) await delay(300);
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(
      fixtureHtml(requestUrl.pathname === "/article" && authenticated),
    );
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Protected fixture did not expose a TCP port");
  }
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function startDemoApp(databasePath) {
  const child = track(
    spawn("pnpm", ["--filter", "@serial/app", "dev:demo"], {
      cwd: repositoryRoot,
      env: { ...process.env, SERIAL_DEMO_DB_FILE: databasePath },
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk.toString()));
  child.stderr.on("data", (chunk) => (output += chunk.toString()));
  return { child, getOutput: () => output };
}

async function waitForDemoUrl(app) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < STARTUP_TIMEOUT_MS) {
    if (app.child.exitCode !== null || app.child.signalCode !== null) {
      throw new Error("Demo app stopped before startup");
    }
    const match = app.getOutput().match(/Demo app:\s+(https?:\/\/\S+)/);
    if (match) {
      try {
        const response = await fetch(match[1], { redirect: "manual" });
        if (response.status > 0) return match[1];
      } catch {
        // The URL is announced before Vite is ready.
      }
    }
    await delay(100);
  }
  throw new Error("Timed out waiting for the demo app");
}

function startFirefox(binary, profilePath, remotePort) {
  const child = track(
    spawn(
      binary,
      [
        "-headless",
        "-profile",
        profilePath,
        "--remote-debugging-port",
        String(remotePort),
        "about:blank",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    ),
  );
  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  return child;
}

async function waitForPort(port, child) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < STARTUP_TIMEOUT_MS) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("Firefox stopped before WebDriver BiDi became available");
    }
    const connected = await new Promise((resolve) => {
      const socket = net.createConnection({ host: "127.0.0.1", port });
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => {
        socket.destroy();
        resolve(false);
      });
    });
    if (connected) return;
    await delay(100);
  }
  throw new Error("Timed out waiting for Firefox WebDriver BiDi");
}

class BidiClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "event") return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.type === "success") pending.resolve(message.result);
      else
        pending.reject(
          new Error(`${message.method ?? "BiDi command"}: ${message.message}`),
        );
    });
  }

  static async connect(url) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.addEventListener("open", () => resolve(new BidiClient(socket)), {
        once: true,
      });
      socket.addEventListener(
        "error",
        () => reject(new Error(`Unable to connect to ${url}`)),
        { once: true },
      );
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out running ${method}`));
      }, ASSERTION_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timeout });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

async function evaluate(client, context, expression) {
  const result = await client.send("script.evaluate", {
    expression,
    target: { context },
    awaitPromise: true,
    resultOwnership: "none",
  });
  if (result.type === "exception") {
    throw new Error(result.exceptionDetails.text ?? "Firefox script failed");
  }
  return result.result?.value;
}

async function eventually(description, check) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < ASSERTION_TIMEOUT_MS) {
    try {
      if (await check()) return;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(
    `${description}${lastError instanceof Error ? `: ${lastError.message}` : ""}`,
  );
}

async function navigate(client, context, url) {
  try {
    await client.send("browsingContext.navigate", {
      context,
      url,
      wait: "complete",
    });
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes("NS_BINDING_ABORTED")
    ) {
      throw error;
    }
  }
  try {
    await eventually(`Firefox did not navigate to ${url}`, async () => {
      const contexts = await topLevelContexts(client);
      return contexts
        .find((candidate) => candidate.context === context)
        ?.url.startsWith(url);
    });
  } catch (error) {
    const contexts = await topLevelContexts(client);
    const actualUrl = contexts.find(
      (candidate) => candidate.context === context,
    )?.url;
    throw new Error(
      `${error instanceof Error ? error.message : error}; current URL is ${actualUrl ?? "unknown"}`,
      { cause: error },
    );
  }
}

function sqlite(databasePath, statement) {
  return new Promise((resolve, reject) => {
    const child = spawn("sqlite3", [databasePath, statement], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve(stdout.trim());
      else
        reject(new Error(stderr.trim() || `sqlite3 exited with code ${code}`));
    });
  });
}

function sqlString(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

async function seedFeedItem(databasePath, fixtureOrigin) {
  let userId = "";
  await eventually("Demo user was not provisioned", async () => {
    userId = await sqlite(
      databasePath,
      "SELECT id FROM serial_user ORDER BY created_at DESC LIMIT 1;",
    );
    return userId.length > 0;
  });

  const sourceUrl = `${fixtureOrigin}/article`;
  const now = Math.floor(Date.now() / 1_000);
  await sqlite(
    databasePath,
    `PRAGMA foreign_keys=ON;
      INSERT INTO serial_feed
        (user_id, name, url, image_url, platform, open_location, created_at, updated_at, is_active)
      VALUES
        (${sqlString(userId)}, 'Firefox capture fixture', ${sqlString(`${fixtureOrigin}/feed`)}, '', 'website', 'serial', ${now}, ${now}, 1);
      INSERT INTO serial_feed_item
        (id, feed_id, content_id, title, author, url, content, content_snippet, content_type, posted_at, created_at, updated_at)
      VALUES
        (${sqlString(ITEM_ID)}, last_insert_rowid(), ${sqlString(ITEM_ID)}, 'Firefox authenticated capture', 'Serial Fixture', ${sqlString(sourceUrl)}, '<p>${FEED_TEASER}</p>', ${sqlString(FEED_TEASER)}, 'text', ${now}, ${now}, ${now});`,
  );
}

async function topLevelContexts(client) {
  const tree = await client.send("browsingContext.getTree");
  return tree.contexts;
}

let temporaryDirectory;
let fixture;
let app;
let firefox;
let bidi;

try {
  temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), "serial-firefox-capture-"),
  );
  const databasePath = path.join(temporaryDirectory, "serial-demo.db");
  const firefoxProfile = path.join(temporaryDirectory, "firefox-profile");
  const firefoxBinary = await findFirefoxBinary();

  console.log("Building the Firefox extension artifact...");
  await run("pnpm", ["--filter", "@serial/extension", "build:firefox"]);

  fixture = await startFixtureServer();
  app = startDemoApp(databasePath);
  const appUrl = await waitForDemoUrl(app);

  const remotePort = await findAvailablePort();
  firefox = startFirefox(firefoxBinary, firefoxProfile, remotePort);
  await waitForPort(remotePort, firefox);
  bidi = await BidiClient.connect(`ws://127.0.0.1:${remotePort}/session`);
  await bidi.send("session.new", {
    capabilities: { alwaysMatch: { acceptInsecureCerts: true } },
  });
  const installed = await bidi.send("webExtension.install", {
    extensionData: { type: "path", path: extensionBuildDirectory },
  });
  if (!installed.extension)
    throw new Error("Firefox did not install the extension");

  const contexts = await topLevelContexts(bidi);
  const appContext = contexts[0]?.context;
  if (!appContext) throw new Error("Firefox did not create a browser context");

  console.log(
    "Signing the disposable Firefox profile into the protected fixture...",
  );
  await navigate(bidi, appContext, `${fixture.origin}/login`);
  await evaluate(
    bidi,
    appContext,
    `document.querySelector("#sign-in")?.click(); true`,
  );
  await eventually("Protected fixture login did not complete", () =>
    evaluate(
      bidi,
      appContext,
      `document.body.innerText.includes(${JSON.stringify(AUTH_MARKER)})`,
    ),
  );

  console.log("Provisioning the disposable Serial demo account...");
  await bidi.send("browsingContext.navigate", {
    context: appContext,
    url: appUrl,
    wait: "complete",
  });
  await eventually("Serial demo account did not finish provisioning", () =>
    evaluate(
      bidi,
      appContext,
      `location.origin === ${JSON.stringify(appUrl)} && !location.pathname.startsWith("/api/demo/provision")`,
    ),
  );
  await seedFeedItem(databasePath, fixture.origin);

  console.log("Opening /read and initiating Capture from the app...");
  // Leave the provisioning page before the app's initial router hydration can
  // race the direct deep-link navigation below.
  await navigate(bidi, appContext, "about:blank");
  await navigate(bidi, appContext, `${appUrl}/read/${ITEM_ID}`);
  await eventually("Capture button did not appear", () =>
    evaluate(
      bidi,
      appContext,
      `Array.from(document.querySelectorAll("button")).some((button) => button.textContent?.trim() === "Capture")`,
    ),
  );

  let monitoring = true;
  let maximumContextCount = 1;
  const monitorContexts = (async () => {
    while (monitoring) {
      maximumContextCount = Math.max(
        maximumContextCount,
        (await topLevelContexts(bidi)).length,
      );
      await delay(25);
    }
  })();
  await evaluate(
    bidi,
    appContext,
    `Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.trim() === "Capture")?.click(); true`,
  );
  try {
    await eventually("Authenticated article was not rendered in Serial", () =>
      evaluate(
        bidi,
        appContext,
        `document.body.innerText.includes(${JSON.stringify(AUTH_MARKER)})`,
      ),
    );
  } catch (error) {
    const diagnostics = await evaluate(
      bidi,
      appContext,
      `JSON.stringify({
        captureState: document.querySelector("[data-prototype-capture-state]")?.getAttribute("data-prototype-capture-state"),
        body: document.body.innerText.slice(-1000)
      })`,
    );
    throw new Error(
      `${error instanceof Error ? error.message : error}; reader diagnostics: ${diagnostics}`,
      { cause: error },
    );
  }
  monitoring = false;
  await monitorContexts;

  const bodyState = await evaluate(
    bidi,
    appContext,
    `JSON.stringify({
      hasAuthBody: document.body.innerText.includes(${JSON.stringify(AUTH_MARKER)}),
      hasFeedTeaser: document.body.innerText.includes(${JSON.stringify(FEED_TEASER)}),
      captureState: document.querySelector("[data-prototype-capture-state]")?.getAttribute("data-prototype-capture-state")
    })`,
  );
  const assertion = JSON.parse(bodyState);
  if (!assertion.hasAuthBody || assertion.hasFeedTeaser) {
    throw new Error(`Unexpected captured reader state: ${bodyState}`);
  }
  if (assertion.captureState !== "captured") {
    throw new Error(`Capture finished in state ${assertion.captureState}`);
  }
  if (maximumContextCount < 2) {
    throw new Error("The extension did not open a temporary capture tab");
  }
  await eventually(
    "Temporary capture tab did not close",
    async () => (await topLevelContexts(bidi)).length === 1,
  );

  console.log(
    "PASS: Firefox returned the signed-in article to /read and closed its capture tab.",
  );
} catch (error) {
  const appOutput = app?.getOutput().trim();
  if (appOutput) {
    console.error(`Demo app log tail:\n${appOutput.slice(-4_000)}`);
  }
  throw error;
} finally {
  if (bidi) {
    await bidi.send("session.end").catch(() => undefined);
    bidi.close();
  }
  await stopChild(firefox);
  await stopChild(app?.child);
  await fixture?.close();
  await stopChildren();
  if (temporaryDirectory) {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
  if (interrupted) process.exitCode = 130;
}
