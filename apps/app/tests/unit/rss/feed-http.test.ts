import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { readFeedHttp } from "~/server/rss/feedHttp";

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

describe("readFeedHttp", () => {
  it("rejects a chunked response once its body exceeds the byte budget", async () => {
    await expect(
      readFeedHttp(`${baseUrl}/oversized`, { maxBodyBytes: 64 }),
    ).rejects.toThrow("Feed response body exceeds 64 bytes");
  });

  it("rejects an oversized declared response before reading its body", async () => {
    await expect(
      readFeedHttp(`${baseUrl}/declared-oversized`, { maxBodyBytes: 64 }),
    ).rejects.toThrow("Feed response Content-Length exceeds 64 bytes");
  });

  it("rejects redirect chains beyond the configured budget", async () => {
    await expect(
      readFeedHttp(`${baseUrl}/redirect-a`, { maxRedirects: 1 }),
    ).rejects.toThrow("Feed request exceeded 1 redirect");
  });

  it("aborts the whole redirect-and-body attempt at its duration budget", async () => {
    await expect(
      readFeedHttp(`${baseUrl}/slow`, { totalDurationMs: 20 }),
    ).rejects.toThrow("Feed request exceeded 20ms total duration");
  });

  it("rejects response headers beyond the configured budget", async () => {
    await expect(
      readFeedHttp(`${baseUrl}/large-headers`, { maxHeaderBytes: 64 }),
    ).rejects.toThrow("Feed response headers exceed 64 bytes");
  });

  it("preserves a bodyless 304 with a representation Content-Length", async () => {
    const response = await readFeedHttp(`${baseUrl}/not-modified`, {
      maxBodyBytes: 64,
    });
    expect(response.status).toBe(304);
    expect(response.text).toBe("");
  });
});
