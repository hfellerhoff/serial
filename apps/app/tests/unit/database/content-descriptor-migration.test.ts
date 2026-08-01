import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { afterEach, describe, expect, it } from "vitest";

const MIGRATIONS_DIRECTORY = "src/server/db/migrations";
const POST_MIGRATIONS_DIRECTORY = "src/server/db/post-migrations";

function statements(content: string) {
  return content
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function applyJournalRange(
  client: ReturnType<typeof createClient>,
  entries: Array<{ idx: number; tag: string }>,
  from: number,
  through: number,
) {
  for (const entry of entries.filter(
    ({ idx }) => idx >= from && idx <= through,
  )) {
    for (const statement of statements(
      readFileSync(`${MIGRATIONS_DIRECTORY}/${entry.tag}.sql`, "utf8"),
    )) {
      await client.execute(statement);
    }
  }
}

describe("content descriptor migration", () => {
  const cleanupDirectories: string[] = [];

  afterEach(() => {
    for (const directory of cleanupDirectories.splice(0)) {
      rmSync(directory, { recursive: true });
    }
  });

  it("keeps exactly one 0049 migration and one normalized-URL post statement", () => {
    const migrationFiles = readdirSync(MIGRATIONS_DIRECTORY).filter((file) =>
      file.startsWith("0049_"),
    );
    expect(migrationFiles).toEqual(["0049_lucky_killer_shrike.sql"]);
    const postFiles = readdirSync(
      `${POST_MIGRATIONS_DIRECTORY}/0049_lucky_killer_shrike`,
    ).filter((file) => file.endsWith(".sql"));
    expect(postFiles).toEqual([
      "001_backfill_feed_item_normalized_url_overrides.sql",
    ]);
    expect(
      statements(
        readFileSync(
          `${POST_MIGRATIONS_DIRECTORY}/0049_lucky_killer_shrike/${postFiles[0]}`,
          "utf8",
        ),
      ),
    ).toHaveLength(1);
  });

  it("applies the complete migration and post-migration chain to a fresh database", async () => {
    const directory = mkdtempSync(join(tmpdir(), "serial-fresh-migration-"));
    cleanupDirectories.push(directory);
    const client = createClient({ url: `file:${directory}/database.sqlite` });
    const journal = JSON.parse(
      readFileSync(`${MIGRATIONS_DIRECTORY}/meta/_journal.json`, "utf8"),
    ) as { entries: Array<{ idx: number; tag: string }> };

    try {
      await applyJournalRange(client, journal.entries, 0, 49);
      for (const statement of statements(
        readFileSync(
          `${POST_MIGRATIONS_DIRECTORY}/0049_lucky_killer_shrike/001_backfill_feed_item_normalized_url_overrides.sql`,
          "utf8",
        ),
      )) {
        await client.execute(statement);
      }

      expect(
        (await client.execute("PRAGMA table_info(serial_views)")).rows.map(
          (row) => row.name,
        ),
      ).toContain("content_filter");
      expect(
        (await client.execute("PRAGMA table_info(serial_feed_item)")).rows.map(
          (row) => row.name,
        ),
      ).toContain("content_type");
      expect(
        (await client.execute("PRAGMA table_info(serial_bookmark)")).rows.map(
          (row) => row.name,
        ),
      ).toContain("classification_source");
    } finally {
      client.close();
    }
  });

  it("advances representative pre-0048 main data through the complete chain", async () => {
    const directory = mkdtempSync(join(tmpdir(), "serial-migration-test-"));
    cleanupDirectories.push(directory);
    const client = createClient({ url: `file:${directory}/database.sqlite` });
    const journal = JSON.parse(
      readFileSync(`${MIGRATIONS_DIRECTORY}/meta/_journal.json`, "utf8"),
    ) as { entries: Array<{ idx: number; tag: string }> };

    try {
      await applyJournalRange(client, journal.entries, 0, 47);

      const now = 1_700_000_000;
      await applyJournalRange(client, journal.entries, 48, 48);
      await client.execute({
        sql: `INSERT INTO serial_user
          (id, name, email, email_verified, created_at, updated_at)
          VALUES ('legacy-user', 'Legacy User', 'legacy@example.com', 1, ?, ?)`,
        args: [now, now],
      });
      for (const [id, contentType] of [
        [1, "longform"],
        [2, "horizontal-video"],
        [3, "vertical-video"],
        [4, "all"],
      ] as const) {
        await client.execute({
          sql: `INSERT INTO serial_views
            (id, user_id, name, content_type, orientation, created_at, updated_at)
            VALUES (?, 'legacy-user', ?, ?, 'horizontal', ?, ?)`,
          args: [id, `View ${id}`, contentType, now, now],
        });
      }
      for (const [id, platform] of [
        [1, "website"],
        [2, "youtube"],
        [3, "peertube"],
        [4, "nebula"],
      ] as const) {
        await client.execute({
          sql: `INSERT INTO serial_feed
            (id, user_id, name, url, platform, created_at, updated_at)
            VALUES (?, 'legacy-user', ?, ?, ?, ?, ?)`,
          args: [
            id,
            `Feed ${id}`,
            `https://feed${id}.example`,
            platform,
            now,
            now,
          ],
        });
        await client.execute({
          sql: `INSERT INTO serial_feed_item
            (id, feed_id, content_id, title, author, url, posted_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'Author', ?, ?, ?, ?)`,
          args: [
            `item-${id}`,
            id,
            `content-${id}`,
            `Item ${id}`,
            `https://feed${id}.example/item`,
            now,
            now,
            now,
          ],
        });
      }
      await client.execute({
        sql: `INSERT INTO serial_bookmark
          (id, user_id, source_url, canonical_url, saved_updated_at,
           read_updated_at, progress_updated_at, created_at, updated_at)
          VALUES ('legacy-bookmark', 'legacy-user', ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          "https://example.com/submitted",
          "https://example.com/article",
          now,
          now,
          now,
          now,
          now,
        ],
      });
      await client.execute({
        sql: `INSERT INTO serial_page_capture
          (bookmark_id, title, author, published_at, content_html,
           effective_url, icon_url, representative_image_url, content_hash,
           capture_source, extractor_version, sanitizer_policy_version, captured_at)
          VALUES ('legacy-bookmark', 'Captured title', 'Writer', ?, '<p>Body</p>',
            'https://example.com/effective', 'https://example.com/icon.png',
            'https://example.com/image.jpg', 'hash', 'server-static-fetch',
            'test', 1, ?)`,
        args: [now, now],
      });

      await applyJournalRange(client, journal.entries, 49, 49);
      for (const statement of statements(
        readFileSync(
          `${POST_MIGRATIONS_DIRECTORY}/0049_lucky_killer_shrike/001_backfill_feed_item_normalized_url_overrides.sql`,
          "utf8",
        ),
      )) {
        await client.execute(statement);
      }

      expect(
        await client.execute(
          "SELECT id, content_filter FROM serial_views ORDER BY id",
        ),
      ).toMatchObject({
        rows: [
          { id: 1, content_filter: 3 },
          { id: 2, content_filter: 2 },
          { id: 3, content_filter: 4 },
          { id: 4, content_filter: 7 },
        ],
      });
      expect(
        await client.execute(
          "SELECT id, content_type FROM serial_feed_item ORDER BY id",
        ),
      ).toMatchObject({
        rows: [
          { id: "item-1", content_type: "text" },
          { id: "item-2", content_type: "video" },
          { id: "item-3", content_type: "video" },
          { id: "item-4", content_type: "video" },
        ],
      });
      expect(
        await client.execute(
          "SELECT effective_url, title, author, thumbnail_url, icon_url, preview_source FROM serial_bookmark",
        ),
      ).toMatchObject({
        rows: [
          {
            effective_url: "https://example.com/effective",
            title: "Captured title",
            author: "Writer",
            thumbnail_url: "https://example.com/image.jpg",
            icon_url: "https://example.com/icon.png",
            preview_source: "server-static-fetch",
          },
        ],
      });
      expect(
        (
          await client.execute("PRAGMA table_info(serial_page_capture)")
        ).rows.map((row) => row.name),
      ).toEqual([
        "bookmark_id",
        "content_html",
        "content_hash",
        "capture_source",
        "extractor_version",
        "sanitizer_policy_version",
        "captured_at",
      ]);
    } finally {
      client.close();
    }
  });
});
