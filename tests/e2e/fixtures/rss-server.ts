import { createServer } from "node:http";

const feeds: Record<string, string> = {
  "scary-pockets": `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Scary Pockets</title>
    <link>http://127.0.0.1:3003</link>
    <description>Scary Pockets</description>
    <item>
      <title>Funky Test Video</title>
      <link>http://127.0.0.1:3003/scary-pockets/1</link>
      <guid>scary-pockets-1</guid>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <description>Test video</description>
    </item>
  </channel>
</rss>`,
  fireship: `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Fireship</title>
    <link>http://127.0.0.1:3003</link>
    <description>Fireship</description>
    <item>
      <title>100 Seconds of Code</title>
      <link>http://127.0.0.1:3003/fireship/1</link>
      <guid>fireship-1</guid>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <description>Test video</description>
    </item>
  </channel>
</rss>`,
  "cgp-grey": `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>CGP Grey</title>
    <link>http://127.0.0.1:3003</link>
    <description>CGP Grey</description>
    <item>
      <title>Rules for Rulers</title>
      <link>http://127.0.0.1:3003/cgp-grey/1</link>
      <guid>cgp-grey-1</guid>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <description>Test video</description>
    </item>
  </channel>
</rss>`,
};

const server = createServer((req, res) => {
  const url = req.url ?? "/";

  if (url === "/") {
    res.writeHead(200);
    res.end("RSS test server");
    return;
  }

  const match = url.match(/^\/feed\/(.+)$/);
  if (match) {
    const slug = match[1];
    if (!slug) {
      res.writeHead(404);
      res.end();
      return;
    }
    const content = feeds[slug];
    if (content) {
      res.writeHead(200, { "Content-Type": "application/rss+xml" });
      res.end(content);
      return;
    }
  }

  res.writeHead(404);
  res.end();
});

server.listen(3003, "127.0.0.1", () => {
  console.log("RSS test server running on http://127.0.0.1:3003");
});
