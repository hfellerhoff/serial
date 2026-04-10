export type OPMLFeedItem = {
  title: string;
  xmlUrl: string;
};

export type OPMLGroup = {
  name: string;
  feeds: OPMLFeedItem[];
};

export type BuildOPMLInput = {
  groups: OPMLGroup[];
  ungroupedFeeds: OPMLFeedItem[];
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function feedOutline(feed: OPMLFeedItem, indent: string): string {
  const title = escapeXml(feed.title);
  const xmlUrl = escapeXml(feed.xmlUrl);
  return `${indent}<outline type="rss" title="${title}" text="${title}" xmlUrl="${xmlUrl}" />`;
}

export function buildOPML(input: BuildOPMLInput): string {
  const lines: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<opml version="2.0">`,
    `  <head><title>Serial Export</title></head>`,
    `  <body>`,
  ];

  // Ungrouped feeds at root level of <body>
  for (const feed of input.ungroupedFeeds) {
    lines.push(feedOutline(feed, "    "));
  }

  // Grouped feeds
  for (const group of input.groups) {
    if (group.feeds.length === 0) continue;
    const groupName = escapeXml(group.name);
    lines.push(`    <outline title="${groupName}" text="${groupName}">`);
    for (const feed of group.feeds) {
      lines.push(feedOutline(feed, "      "));
    }
    lines.push(`    </outline>`);
  }

  lines.push(`  </body>`);
  lines.push(`</opml>`);

  return lines.join("\n");
}
