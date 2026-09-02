import { createServer } from "node:http";

/**
 * Stub AT Protocol AppView for e2e: serves searchActorsTypeahead with
 * canned actors so the auth-page typeahead is testable hermetically. The
 * canned actors deliberately omit avatars — an avatar URL would make the
 * browser fetch it, and these specs assert no request leaves the Serial
 * origin.
 */

const port = Number(process.argv[2]) || 3009;

const ACTORS = [
  {
    did: "did:plc:e2e-alice",
    handle: "alice.test",
    displayName: "Alice Test",
  },
  {
    did: "did:plc:e2e-alina",
    handle: "alina.test",
    displayName: "Alina Test",
  },
];

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);

  if (url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }

  if (url.pathname === "/xrpc/app.bsky.actor.searchActorsTypeahead") {
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    const actors = q
      ? ACTORS.filter(
          (actor) =>
            actor.handle.startsWith(q) ||
            actor.displayName.toLowerCase().startsWith(q),
        )
      : [];
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ actors }));
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "NotFound" }));
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Stub AppView listening on http://127.0.0.1:${port}`);
});
