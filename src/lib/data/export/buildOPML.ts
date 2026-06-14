export type OPMLFeedItem = {
  title: string;
  xmlUrl: string;
  tags?: string[];
};

export type OPMLGroup = {
  name: string;
  feeds: OPMLFeedItem[];
  groups?: OPMLGroup[];
  outlineType?: "view" | "tag" | "feed";
  feedXmlUrl?: string;
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

function attribute(name: string, value: string | undefined): string {
  if (!value) return "";
  return ` ${name}="${escapeXml(value)}"`;
}

function serializeTags(tags?: string[]) {
  if (!tags || tags.length === 0) return undefined;
  return JSON.stringify(tags);
}

function feedOutline(feed: OPMLFeedItem, indent: string): string {
  const title = escapeXml(feed.title);
  const xmlUrl = escapeXml(feed.xmlUrl);
  const standardCategory = feed.tags?.join(",");
  const serialTags = serializeTags(feed.tags);

  return `${indent}<outline type="rss" title="${title}" text="${title}" xmlUrl="${xmlUrl}"${attribute(
    "category",
    standardCategory,
  )}${attribute("serial:tags", serialTags)} />`;
}

function groupOutline(group: OPMLGroup, indent: string): string[] {
  const groupName = escapeXml(group.name);
  const lines = [
    `${indent}<outline title="${groupName}" text="${groupName}"${attribute(
      "serial:outlineType",
      group.outlineType,
    )}${attribute("serial:feedXmlUrl", group.feedXmlUrl)}>`,
  ];
  const childIndent = `${indent}  `;

  for (const feed of group.feeds) {
    lines.push(feedOutline(feed, childIndent));
  }

  for (const childGroup of group.groups ?? []) {
    lines.push(...groupOutline(childGroup, childIndent));
  }

  lines.push(`${indent}</outline>`);

  return lines;
}

export function buildOPML(input: BuildOPMLInput): string {
  const lines: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<opml version="2.0" xmlns:serial="https://serial.tube/opml">`,
    `  <head><title>Serial Export</title></head>`,
    `  <body>`,
  ];

  // Ungrouped feeds at root level of <body>
  for (const feed of input.ungroupedFeeds) {
    lines.push(feedOutline(feed, "    "));
  }

  // Grouped feeds
  for (const group of input.groups) {
    if (group.feeds.length === 0 && (group.groups ?? []).length === 0) {
      continue;
    }
    lines.push(...groupOutline(group, "    "));
  }

  lines.push(`  </body>`);
  lines.push(`</opml>`);

  return lines.join("\n");
}
