import { createServer } from "node:http";
import { RSS_SERVER_PORT } from "./ports";

const BASE = `http://127.0.0.1:${RSS_SERVER_PORT}`;

const feeds: Record<string, string> = {
  "scary-pockets": `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Scary Pockets</title>
    <link>${BASE}</link>
    <description>Scary Pockets</description>
    <item>
      <title>Funky Test Video</title>
      <link>${BASE}/scary-pockets/1</link>
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
    <link>${BASE}</link>
    <description>Fireship</description>
    <item>
      <title>100 Seconds of Code</title>
      <link>${BASE}/fireship/1</link>
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
    <link>${BASE}</link>
    <description>CGP Grey</description>
    <item>
      <title>Rules for Rulers</title>
      <link>${BASE}/cgp-grey/1</link>
      <guid>cgp-grey-1</guid>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <description>Test video</description>
    </item>
  </channel>
</rss>`,
  "test-blog": `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Test Blog</title>
    <link>${BASE}</link>
    <description>Test Blog</description>
    <item>
      <title>Test Article</title>
      <link>${BASE}/test-blog/1</link>
      <guid>test-blog-1</guid>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <description>Test article content</description>
      <content:encoded><![CDATA[${Array.from({ length: 20 }, (_, i) => `<p>Paragraph ${i + 1}: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.</p>`).join("\n")}]]></content:encoded>
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

server.listen(RSS_SERVER_PORT, "127.0.0.1", () => {
  console.log(`RSS test server running on ${BASE}`);
});
