import { createServer } from "node:http";

/**
 * Stub Resend API for e2e: captures every sent email in memory so specs
 * can enable real email flows (verification links, invites) hermetically.
 * The app server reaches it through the SDK's RESEND_BASE_URL override;
 * specs read captured messages back via GET /e2e/emails?to=<address>.
 */

const port = Number(process.argv[2]) || 3012;

/** The Resend payload fields specs read back; the rest is stored as-is. */
interface CapturedEmail {
  to?: string | string[];
  html?: string;
}

const emails: CapturedEmail[] = [];

function matchesRecipient(email: CapturedEmail, recipient: string) {
  const to = Array.isArray(email.to) ? email.to : [email.to];
  return to.includes(recipient);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);

  if (url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }

  if (req.method === "POST" && url.pathname === "/emails") {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        emails.push(JSON.parse(body) as CapturedEmail);
      } catch {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ message: "invalid body" }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: `e2e-email-${emails.length}` }));
    });
    return;
  }

  if (req.method === "DELETE" && url.pathname === "/e2e/emails") {
    emails.length = 0;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ cleared: true }));
    return;
  }

  if (req.method === "GET" && url.pathname === "/e2e/emails") {
    const recipient = url.searchParams.get("to");
    const matched = recipient
      ? emails.filter((email) => matchesRecipient(email, recipient))
      : emails;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ emails: matched }));
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "NotFound" }));
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Stub email server listening on http://127.0.0.1:${port}`);
});
