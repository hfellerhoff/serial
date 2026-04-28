// Example model schema from the Drizzle docs
// https://orm.drizzle.team/docs/sql-schema-declaration

import { createId } from "@paralleldrive/cuid2";
import { relations } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTableCreator,
  text,
  unique,
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
  VIEW_CONTENT_TYPE,
  VIEW_LAYOUT,
  VIEW_READ_STATUS,
  viewContentTypeSchema,
  viewLayoutSchema,
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
export const user = sqliteTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: integer("email_verified", { mode: "boolean" }).notNull(),
    image: text("image"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
    role: text("role"),
    banned: integer("banned", { mode: "boolean" }).default(false),
    banReason: text("ban_reason"),
    banExpires: integer("ban_expires", { mode: "timestamp_ms" }),
    nextRefreshAt: integer("next_refresh_at", { mode: "timestamp" }),
  },
  (table) => [
    index("user_created_at_idx").on(table.createdAt),
    index("user_next_refresh_at_idx").on(table.nextRefreshAt),
  ],
);

export const session = sqliteTable(
  "session",
  {
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
    impersonatedBy: text("impersonated_by"),
  },
  (table) => [
    index("session_user_id_idx").on(table.userId),
    index("session_created_at_idx").on(table.createdAt),
  ],
);

export const account = sqliteTable(
  "account",
  {
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
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
);

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const invitation = sqliteTable(
  "invitation",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    name: text("name"), // optional human-readable label
    token: text("token").notNull().unique(),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("active"), // "active" | "disabled"
    maxUses: integer("max_uses"), // null = unlimited
    expiresAt: integer("expires_at", { mode: "timestamp" }), // null = never expires
    createdAt: integer("created_at", { mode: "timestamp" })
      .$default(() => new Date())
      .notNull(),
  },
  (table) => [index("invitation_inviter_id_idx").on(table.inviterId)],
);

export const invitationRedemption = sqliteTable(
  "invitation_redemption",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    invitationId: text("invitation_id")
      .notNull()
      .references(() => invitation.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$default(() => new Date())
      .notNull(),
  },
  (table) => [
    index("invitation_redemption_invitation_id_idx").on(table.invitationId),
  ],
);

// === End: Better Auth ===

export const feeds = sqliteTable(
  "feed",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name", { length: 256 }).notNull().default(""),
    url: text("url", { length: 512 }).notNull().default(""),
    imageUrl: text("image_url", { length: 512 }).notNull().default(""),
    platform: text("platform", { length: 256 }).notNull().default("youtube"),
    openLocation: text("open_location", { length: 64 })
      .notNull()
      .default("serial"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$default(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$default(() => new Date())
      .notNull(),
    lastFetchedAt: integer("last_fetched_at", { mode: "timestamp" }),
    nextFetchAt: integer("next_fetch_at", { mode: "timestamp" }),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    etag: text("etag"),
    lastModifiedHeader: text("last_modified_header"),
  },
  (example) => [
    index("feed_user_id_idx").on(example.userId),
    index("feed_user_id_url_idx").on(example.userId, example.url),
    index("feed_user_id_is_active_idx").on(
      example.userId,
      example.isActive,
      example.lastFetchedAt,
    ),
    index("feed_is_active_next_fetch_at_idx").on(
      example.isActive,
      example.nextFetchAt,
    ),
  ],
);
export const platformsSchema = z.enum([
  "youtube",
  "peertube",
  "nebula",
  "website",
]);
export type FeedPlatform = z.infer<typeof platformsSchema>;

export const openLocationSchema = z.enum(["serial", "origin"]);
export type FeedOpenLocation = z.infer<typeof openLocationSchema>;

export const PLATFORM_DEFAULT_OPEN_LOCATION: Partial<
  Record<FeedPlatform, FeedOpenLocation>
> = {
  nebula: "origin",
};

export const feedsSchema = createSelectSchema(feeds).merge(
  z.object({
    platform: platformsSchema,
    openLocation: openLocationSchema,
  }),
);
export type DatabaseFeed = typeof feeds.$inferSelect;
export type ApplicationFeed = z.infer<typeof feedsSchema>;

export const feedItems = sqliteTable(
  "feed_item",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    feedId: integer("feed_id")
      .notNull()
      .references(() => feeds.id, { onDelete: "cascade" }),
    contentId: text("content_id", { length: 512 }).notNull(),
    title: text("title", { length: 512 }).notNull(),
    author: text("author", { length: 512 }).notNull(),
    url: text("url", { length: 512 }).notNull(),
    thumbnail: text("thumbnail", { length: 512 }).notNull().default(""),
    content: text("content").notNull().default(""),
    contentSnippet: text("content_snippet").notNull().default(""),
    isWatched: integer("is_watched", { mode: "boolean" })
      .notNull()
      .default(false),
    isWatchLater: integer("is_watch_later", { mode: "boolean" })
      .notNull()
      .default(false),
    progress: integer("progress", { mode: "number" }).notNull().default(0),
    duration: integer("duration", { mode: "number" }).notNull().default(0),
    orientation: text("orientation", { length: 64 }),
    postedAt: integer("posted_at", { mode: "timestamp" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$default(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$default(() => new Date())
      .notNull(),
    contentHash: text("content_hash"),
  },
  (example) => [
    unique().on(example.url, example.feedId),
    index("feed_item_feed_id_posted_at_idx").on(
      example.feedId,
      example.postedAt,
    ),
    // Composite index for the main view-diff queries:
    //   WHERE feed_id IN (...) AND is_watched = ? AND is_watch_later = ?
    //   ORDER BY posted_at DESC LIMIT 31
    // Lets SQLite seek directly to (feedId, isWatched, isWatchLater) and
    // scan posted_at in order — avoids scanning/sorting watched items.
    index("feed_item_feed_id_visibility_posted_at_idx").on(
      example.feedId,
      example.isWatched,
      example.isWatchLater,
      example.postedAt,
    ),
    // Covers the "later" visibility filter which only checks isWatchLater
    // without constraining isWatched, so it can't use the wider composite.
    index("feed_item_feed_id_is_watch_later_posted_at_idx").on(
      example.feedId,
      example.isWatchLater,
      example.postedAt,
    ),
  ],
);
export const feedItemSchema = createSelectSchema(feedItems);
export type DatabaseFeedItem = typeof feedItems.$inferSelect;

export const applicationFeedItemSchema = feedItemSchema
  .merge(
    z.object({
      platform: platformsSchema,
      orientation: feedItemOrientationSchema.optional(),
    }),
  )
  .required();
export type ApplicationFeedItem = z.infer<typeof applicationFeedItemSchema>;

export const contentCategories = sqliteTable(
  "content_categories",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name", { length: 256 }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$default(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$default(() => new Date())
      .notNull(),
  },
  (example) => [
    index("content_categories_user_id_name_idx").on(
      example.userId,
      example.name,
    ),
  ],
);
export const contentCategorySchema = createSelectSchema(contentCategories);
export type DatabaseContentCategory = typeof contentCategories.$inferSelect;

export const feedCategories = sqliteTable(
  "feed_categories",
  {
    feedId: integer("feed_id")
      .notNull()
      .references(() => feeds.id, { onDelete: "cascade" }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => contentCategories.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.feedId, table.categoryId] }),
    index("feed_categories_category_id_idx").on(table.categoryId),
  ],
);
export const feedCategorySchema = createSelectSchema(feedCategories);
export type DatabaseFeedCategory = typeof feedCategories.$inferSelect;

export const userConfig = sqliteTable("user_config", {
  id: text("id")
    .primaryKey()
    .$default(() => createId()),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$default(() => new Date())
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$default(() => new Date())
    .notNull(),
  lightHSL: text("light_hsl", { length: 16 }).notNull().default(""),
  darkHSL: text("dark_hsl", { length: 16 }).notNull().default(""),
  articleFontSize: integer("article_font_size"),
  articleFontFamily: text("article_font_family", { length: 64 }),
});
export type DatabaseUserConfig = typeof userConfig.$inferSelect;

export const views = sqliteTable(
  "views",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name", { length: 256 }).notNull().default(""),
    daysWindow: integer("days_window", { mode: "number" }).notNull().default(0),
    readStatus: integer("read_status", { mode: "number" })
      .notNull()
      .default(VIEW_READ_STATUS.UNREAD),
    orientation: text("orientation", { length: 16 })
      .notNull()
      .default(FEED_ITEM_ORIENTATION.HORIZONTAL),
    contentType: text("content_type", { length: 32 })
      .notNull()
      .default(VIEW_CONTENT_TYPE.LONGFORM),
    layout: text("layout", { length: 32 }).notNull().default(VIEW_LAYOUT.LIST),
    placement: integer("placement", { mode: "number" }).notNull().default(-1),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$default(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$default(() => new Date())
      .notNull(),
  },
  (example) => [
    index("view_user_id_idx").on(example.userId),
    index("view_user_id_placement_idx").on(example.userId, example.placement),
  ],
);

export const viewSchema = createSelectSchema(views);
export type DatabaseView = typeof views.$inferSelect;

export const applicationViewSchema = createInsertSchema(views)
  .merge(
    z.object({
      categoryIds: z.array(z.number()),
      feedIds: z.array(z.number()),
      isDefault: z.boolean(),
    }),
  )
  .required();
export type ApplicationView = z.infer<typeof applicationViewSchema>;

export const viewCategories = sqliteTable(
  "view_categories",
  {
    viewId: integer("view_id").references(() => views.id, {
      onDelete: "cascade",
    }),
    categoryId: integer("category_id").references(() => contentCategories.id, {
      onDelete: "cascade",
    }),
  },
  (table) => [
    primaryKey({ columns: [table.viewId, table.categoryId] }),
    index("view_categories_view_id_idx").on(table.viewId),
    index("view_categories_category_id_idx").on(table.categoryId),
  ],
);
export type DatabaseViewCategory = typeof viewCategories.$inferSelect;

export const viewFeeds = sqliteTable(
  "view_feeds",
  {
    viewId: integer("view_id")
      .notNull()
      .references(() => views.id, { onDelete: "cascade" }),
    feedId: integer("feed_id")
      .notNull()
      .references(() => feeds.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.viewId, table.feedId] }),
    index("view_feeds_view_id_idx").on(table.viewId),
    index("view_feeds_feed_id_idx").on(table.feedId),
  ],
);
export type DatabaseViewFeed = typeof viewFeeds.$inferSelect;

export const createViewSchema = createInsertSchema(views)
  .omit({ userId: true })
  .merge(
    z.object({
      readStatus: viewReadStatusSchema.optional(),
      orientation: feedItemOrientationSchema.optional(),
      contentType: viewContentTypeSchema.optional(),
      layout: viewLayoutSchema.optional(),
      daysWindow: z.number().lte(30).optional(),
      placement: z.number().gte(-1).optional(),
      categoryIds: z.array(z.number()).optional(),
      feedIds: z.array(z.number()).optional(),
    }),
  );

export const updateViewSchema = createUpdateSchema(views).merge(
  z.object({
    id: z.number(),
    categoryIds: z.array(z.number()),
    feedIds: z.array(z.number()),
    contentType: viewContentTypeSchema.optional(),
    layout: viewLayoutSchema.optional(),
  }),
);

export const deleteViewSchema = z.object({
  id: z.number(),
});

// === Instapaper OAuth 1.0a Connections ===
export const instapaperConnections = sqliteTable("instapaper_connections", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  username: text("username").notNull(),
  oauthToken: text("oauth_token").notNull(),
  oauthTokenSecret: text("oauth_token_secret").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$default(() => new Date())
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$default(() => new Date())
    .notNull(),
});
export type DatabaseInstapaperConnection =
  typeof instapaperConnections.$inferSelect;

// === App Config (app-wide settings) ===

/**
 * Type-safe app config key -> value mappings
 */
export type AppConfigKeys = {
  "public-signup-enabled": "true" | "false";
  "enabled-signin-providers": string; // JSON array, e.g. '["email","oauth"]'
  "enabled-signup-providers": string; // JSON array, e.g. '["email","oauth"]'
  "admin-notify-on-signup": "true" | "false";
  "admin-notify-email": string; // email address to notify
};

export type AppConfigKey = keyof AppConfigKeys;

export const appConfig = sqliteTable("app_config", {
  key: text("key").$type<AppConfigKey>().primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$default(() => new Date())
    .notNull(),
});
export type DatabaseAppConfig = typeof appConfig.$inferSelect;
