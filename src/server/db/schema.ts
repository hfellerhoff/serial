// Example model schema from the Drizzle docs
// https://orm.drizzle.team/docs/sql-schema-declaration

import {
  index,
  integer,
  primaryKey,
  sqliteTableCreator,
  text,
} from "drizzle-orm/sqlite-core";
import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-zod";
import { z } from "zod";
import {
  FEED_ITEM_ORIENTATION,
  feedItemOrientationSchema,
  VIEW_READ_STATUS,
  viewReadStatusSchema,
} from "./constants";

/**
 * This is an example of how to use the multi-project schema feature of Drizzle ORM. Use the same
 * database instance for multiple projects.
 *
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const sqliteTable = sqliteTableCreator((name) => `serial_${name}`);

// === Start: Better Auth ===
export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull(),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", {
    mode: "timestamp",
  }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", {
    mode: "timestamp",
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});
// === End: Better Auth ===

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
export const platformsSchema = z.enum(["youtube", "peertube"]);
export type FeedPlatform = z.infer<typeof platformsSchema>;

export const feedsSchema = createSelectSchema(feeds).merge(
  z.object({
    platform: platformsSchema,
  }),
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
export const feedItemSchema = createSelectSchema(feedItems);
export type DatabaseFeedItem = typeof feedItems.$inferSelect;

export const applicationFeedItemSchema = feedItemSchema
  .merge(
    z.object({
      platform: platformsSchema,
    }),
  )
  .required();
export type ApplicationFeedItem = z.infer<typeof applicationFeedItemSchema>;

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
export const contentCategorySchema = createSelectSchema(contentCategories);
export type DatabaseContentCategory = typeof contentCategories.$inferSelect;

export const feedCategories = sqliteTable(
  "feed_categories",
  {
    feedId: integer("feed_id").references(() => feeds.id),
    categoryId: integer("category_id").references(() => contentCategories.id),
  },
  (table) => [primaryKey({ columns: [table.feedId, table.categoryId] })],
);
export const feedCategorySchema = createSelectSchema(feedCategories);
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

export const views = sqliteTable(
  "views",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull().default(""),
    name: text("name", { length: 256 }).notNull().default(""),
    daysWindow: integer("days_window", { mode: "number" }).notNull().default(1),
    readStatus: integer("read_status", { mode: "number" })
      .notNull()
      .default(VIEW_READ_STATUS.UNREAD),
    orientation: text("orientation", { length: 16 })
      .notNull()
      .default(FEED_ITEM_ORIENTATION.HORIZONTAL),
    placement: integer("read_status", { mode: "number" }).notNull().default(-1),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$default(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$default(() => new Date())
      .notNull(),
  },
  (example) => [index("view_name_idx").on(example.name)],
);

export const viewSchema = createSelectSchema(views);
export type DatabaseView = typeof views.$inferSelect;

export const applicationViewSchema = createInsertSchema(views)
  .merge(
    z.object({
      categoryIds: z.array(z.number()),
      isDefault: z.boolean(),
    }),
  )
  .required();
export type ApplicationView = z.infer<typeof applicationViewSchema>;

export const viewCategories = sqliteTable(
  "view_categories",
  {
    viewId: integer("view_id").references(() => views.id),
    categoryId: integer("category_id").references(() => contentCategories.id),
  },
  (table) => [primaryKey({ columns: [table.viewId, table.categoryId] })],
);
export type DatabaseViewCategory = typeof viewCategories.$inferSelect;

export const createViewSchema = createInsertSchema(views).merge(
  z.object({
    readStatus: viewReadStatusSchema.optional(),
    orientation: feedItemOrientationSchema.optional(),
    daysWindow: z.number().lte(30).optional(),
    placement: z.number().gte(-1).optional(),
    categoryIds: z.array(z.number()).optional(),
  }),
);

export const updateViewSchema = createUpdateSchema(views).merge(
  z.object({
    id: z.number(),
    categoryIds: z.array(z.number()),
  }),
);

export const deleteViewSchema = z.object({
  id: z.number(),
});
