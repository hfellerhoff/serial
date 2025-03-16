// Example model schema from the Drizzle docs
// https://orm.drizzle.team/docs/sql-schema-declaration

import {
  integer,
  text,
  sqliteTableCreator,
  index,
  primaryKey,
} from "drizzle-orm/sqlite-core";

/**
 * This is an example of how to use the multi-project schema feature of Drizzle ORM. Use the same
 * database instance for multiple projects.
 *
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const sqliteTable = sqliteTableCreator((name) => `serial_${name}`);

export const feeds = sqliteTable(
  "feed",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull().default(""),
    name: text("name", { length: 256 }).notNull().default(""),
    url: text("url", { length: 512 }).notNull().default(""),
    platform: text("platform", { length: 256 }).notNull().default("youtube"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$default(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$default(() => new Date())
      .notNull(),
  },
  (example) => [index("feed_name_idx").on(example.name)],
);
export type DatabaseFeed = typeof feeds.$inferSelect;

export const feedItems = sqliteTable(
  "feed_item",
  {
    feedId: integer("feed_id").references(() => feeds.id),
    contentId: text("content_id", { length: 512 }).notNull(),
    title: text("title", { length: 512 }).notNull(),
    author: text("author", { length: 512 }).notNull(),
    url: text("url", { length: 512 }).notNull(),
    thumbnail: text("thumbnail", { length: 512 }).notNull().default(""),
    isWatched: integer("is_watched", { mode: "boolean" })
      .notNull()
      .default(false),
    isWatchLater: integer("is_watch_later", { mode: "boolean" })
      .notNull()
      .default(false),
    orientation: text("orientation", { length: 64 }),
    postedAt: integer("posted_at", { mode: "timestamp" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$default(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$default(() => new Date())
      .notNull(),
  },
  (example) => [
    primaryKey({ columns: [example.feedId, example.contentId] }),
    index("feed_item_feed_id_idx").on(example.feedId),
  ],
);
export type DatabaseFeedItem = typeof feedItems.$inferSelect;

export const contentCategories = sqliteTable(
  "content_categories",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull().default(""),
    name: text("name", { length: 256 }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$default(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$default(() => new Date())
      .notNull(),
  },
  (example) => [index("content_categories_name_idx").on(example.name)],
);
export type DatabaseContentCategory = typeof contentCategories.$inferSelect;

export const feedCategories = sqliteTable(
  "feed_categories",
  {
    feedId: integer("feed_id").references(() => feeds.id),
    categoryId: integer("category_id").references(() => contentCategories.id),
  },
  (table) => [primaryKey({ columns: [table.feedId, table.categoryId] })],
);
export type DatabaseFeedCategory = typeof feedCategories.$inferSelect;

export const userConfig = sqliteTable("user_config", {
  userId: text("user_id").primaryKey(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$default(() => new Date())
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$default(() => new Date())
    .notNull(),
  lightHSL: text("light_hsl", { length: 16 }).notNull().default(""),
  darkHSL: text("dark_hsl", { length: 16 }).notNull().default(""),
});
export type DatabaseUserConfig = typeof userConfig.$inferSelect;
