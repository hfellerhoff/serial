import { createServer } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { readFeedHttp } from "~/server/rss/feedHttp";

const LOCAL_HTTP_DEPENDENCIES = {
  validateTarget: (value: string) => new URL(value),
  resolveAddresses: () =>
    Promise.resolve([{ address: "127.0.0.1", family: 4 }]),
};

function readLocalFeedHttp(
  url: string,
  options: Parameters<typeof readFeedHttp>[1] = {},
) {
  return readFeedHttp(url, options, LOCAL_HTTP_DEPENDENCIES);
}

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer((request, response) => {
    if (request.url === "/redirect-a") {
      response.writeHead(302, { Location: "/redirect-b" });
      response.end();
      return;
    }

    if (request.url === "/redirect-b") {
      response.writeHead(302, { Location: "/feed" });
      response.end();
      return;
    }

    if (request.url === "/feed") {
      response.writeHead(200, { "Content-Type": "application/rss+xml" });
      response.end("<rss />");
      return;
    }

    if (request.url === "/slow") {
      response.writeHead(200, { "Content-Type": "application/rss+xml" });
      response.write("<rss>");
      setTimeout(() => response.end("</rss>"), 100);
      return;
    }

    if (request.url === "/large-headers") {
      response.writeHead(200, {
        "Content-Type": "application/rss+xml",
        "X-Large": "x".repeat(80),
      });
      response.end("<rss />");
      return;
    }
    if (request.url === "/not-modified") {
      response.writeHead(304, { "Content-Length": "1024" });
      response.end();
      return;
    }

    if (request.url === "/declared-oversized") {
      response.writeHead(200, {
        "Content-Length": "65",
        "Content-Type": "application/rss+xml",
      });
      response.end("x".repeat(65));
      return;
    }

    if (request.url === "/three-megabytes") {
      response.writeHead(200, { "Content-Type": "application/rss+xml" });
      response.end(`<rss>${"x".repeat(3 * 1024 * 1024)}</rss>`);
      return;
    }

    if (request.url === "/declared-eleven-megabytes") {
      response.writeHead(200, {
        "Content-Length": `${11 * 1024 * 1024}`,
        "Content-Type": "application/rss+xml",
      });
      response.end();
      return;
    }

    if (request.url === "/oversized") {
      response.writeHead(200, { "Content-Type": "application/rss+xml" });
      response.end("x".repeat(65));
      return;
    }

    response.writeHead(404);
    response.end();
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") {
        baseUrl = `http://127.0.0.1:${address.port}`;
      }
      resolve();
    });
  });
});

afterAll(() => {
  server.close();
});

afterEach(() => {
  delete process.env.SERIAL_TEST_RSS_ALLOW_LOOPBACK;
  delete process.env.SERIAL_TEST_RSS_ORIGIN;
});

describe("readFeedHttp", () => {
  it("rejects private-network targets before opening a connection", async () => {
    await expect(readFeedHttp("http://127.0.0.1/feed.xml")).rejects.toThrow(
      "not public",
    );
  });

  it("rejects a configured loopback RSS origin without the test-runner capability", async () => {
    process.env.SERIAL_TEST_RSS_ORIGIN = baseUrl;

    await expect(readFeedHttp(`${baseUrl}/feed`)).rejects.toThrow(
      "not allowed",
    );
  });

  it("allows only the exact loopback RSS origin authorized by the test runner", async () => {
    process.env.SERIAL_TEST_RSS_ALLOW_LOOPBACK = "1";
    process.env.SERIAL_TEST_RSS_ORIGIN = baseUrl;

    await expect(readFeedHttp(`${baseUrl}/feed`)).resolves.toMatchObject({
      status: 200,
      text: "<rss />",
    });
    await expect(readFeedHttp("http://127.0.0.1:9/feed.xml")).rejects.toThrow(
      "not allowed",
    );
    await expect(readFeedHttp("not a URL")).rejects.toThrow("invalid");
  });

  it("rejects a chunked response once its body exceeds the byte budget", async () => {
    await expect(
      readLocalFeedHttp(`${baseUrl}/oversized`, { maxBodyBytes: 64 }),
    ).rejects.toThrow("Feed response body exceeds 64 bytes");
  });

  it("rejects an oversized declared response before reading its body", async () => {
    await expect(
      readLocalFeedHttp(`${baseUrl}/declared-oversized`, { maxBodyBytes: 64 }),
    ).rejects.toThrow("Feed response Content-Length exceeds 64 bytes");
  });

  it("accepts a body larger than 2 MiB under the default budget", async () => {
    const response = await readLocalFeedHttp(`${baseUrl}/three-megabytes`);
    expect(response.status).toBe(200);
    expect(response.text.length).toBeGreaterThan(3 * 1024 * 1024);
  });

  it("rejects a declared body beyond the 10 MiB default budget", async () => {
    await expect(
      readLocalFeedHttp(`${baseUrl}/declared-eleven-megabytes`),
    ).rejects.toThrow(
      `Feed response Content-Length exceeds ${10 * 1024 * 1024} bytes`,
    );
  });

  it("rejects redirect chains beyond the configured budget", async () => {
    await expect(
      readLocalFeedHttp(`${baseUrl}/redirect-a`, { maxRedirects: 1 }),
    ).rejects.toThrow("Feed request exceeded 1 redirect");
  });

  it("aborts the whole redirect-and-body attempt at its duration budget", async () => {
    await expect(
      readLocalFeedHttp(`${baseUrl}/slow`, { totalDurationMs: 20 }),
    ).rejects.toThrow("Feed request exceeded 20ms total duration");
  });

  it("rejects response headers beyond the configured budget", async () => {
    await expect(
      readLocalFeedHttp(`${baseUrl}/large-headers`, { maxHeaderBytes: 64 }),
    ).rejects.toThrow("Feed response headers exceed 64 bytes");
  });

  it("preserves a bodyless 304 with a representation Content-Length", async () => {
    const response = await readLocalFeedHttp(`${baseUrl}/not-modified`, {
      maxBodyBytes: 64,
    });
    expect(response.status).toBe(304);
    expect(response.text).toBe("");
  });
});
