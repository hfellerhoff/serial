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
  VIEW_LAYOUT,
  VIEW_LAYOUT_ITEM_TYPE,
  VIEW_READ_STATUS,
  viewLayoutItemTypeSchema,
  viewLayoutSchema,
  viewReadStatusSchema,
} from "./constants";
import type { ContentPlatform } from "~/lib/content/descriptor";
import {
  CONTENT_PLATFORM,
  CONTENT_TYPE,
  contentPlatformSchema,
  contentTypeSchema,
  OBSERVATION_SOURCE,
  observationSourceSchema,
  videoOrientationSchema,
} from "~/lib/content/descriptor";
import {
  contentFilterSchema,
  DEFAULT_CONTENT_FILTER,
} from "~/lib/views/contentFilter";
import {
  boundedNumberIdsSchema,
  MAX_BULK_MUTATION_ITEMS,
} from "~/lib/schemas/bulk";

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
    // Policy bit, not proof of address ownership: true means this user is not
    // required to verify their email (identity-provider-provisioned accounts).
    // Maintained by the account-creation hook in src/server/auth/index.tsx.
    emailVerificationExempt: integer("email_verification_exempt", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
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

export const extensionSession = sqliteTable(
  "extension_session",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    tokenHash: text("token_hash").notNull().unique(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$default(() => new Date())
      .notNull(),
  },
  (table) => [
    index("extension_session_user_id_idx").on(table.userId),
    index("extension_session_expires_at_idx").on(table.expiresAt),
  ],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  extensionSessions: many(extensionSession),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const extensionSessionRelations = relations(
  extensionSession,
  ({ one }) => ({
    user: one(user, {
      fields: [extensionSession.userId],
      references: [user.id],
    }),
  }),
);

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
    index("feed_user_id_is_active_next_fetch_at_idx").on(
      example.userId,
      example.isActive,
      example.nextFetchAt,
    ),
  ],
);
export const openLocationSchema = z.enum(["serial", "origin"]);
export type FeedOpenLocation = z.infer<typeof openLocationSchema>;

export const PLATFORM_DEFAULT_OPEN_LOCATION: Partial<
  Record<ContentPlatform, FeedOpenLocation>
> = {
  nebula: "origin",
};

export const feedsSchema = createSelectSchema(feeds).merge(
  z.object({
    platform: contentPlatformSchema,
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
    // Stored only when production URL normalization changes the Feed URL.
    // Most rows remain null and compare through COALESCE(normalizedUrl, url).
    normalizedUrl: text("normalized_url", { length: 4096 }),
    thumbnail: text("thumbnail", { length: 512 }).notNull().default(""),
    content: text("content").notNull().default(""),
    contentSnippet: text("content_snippet").notNull().default(""),
    contentType: text("content_type", {
      enum: [CONTENT_TYPE.TEXT, CONTENT_TYPE.VIDEO],
    })
      .notNull()
      .default(CONTENT_TYPE.TEXT),
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
    isWatchedUpdatedAt: integer("is_watched_updated_at", { mode: "timestamp" }),
    isWatchLaterUpdatedAt: integer("is_watch_later_updated_at", {
      mode: "timestamp",
    }),
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
    // Covers Saved content ordered by its save-state update time.
    // without constraining isWatched, so it can't use the wider composite.
    index("feed_item_feed_id_is_watch_later_posted_at_idx").on(
      example.feedId,
      example.isWatchLater,
      example.postedAt,
    ),
    // Covers Archived content ordered by its archive-state update time.
    index("feed_item_feed_id_is_watched_updated_at_idx").on(
      example.feedId,
      example.isWatched,
      example.isWatchedUpdatedAt,
    ),
  ],
);
export const feedItemSchema = createSelectSchema(feedItems);
export type DatabaseFeedItem = typeof feedItems.$inferSelect;

export const applicationFeedItemSchema = feedItemSchema
  .omit({ normalizedUrl: true })
  .merge(
    z.object({
      platform: contentPlatformSchema,
      contentType: contentTypeSchema,
      orientation: videoOrientationSchema.nullable(),
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

// === Bookmarks ===

export const bookmarks = sqliteTable(
  "bookmark",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sourceUrl: text("source_url").notNull(),
    effectiveUrl: text("effective_url").notNull().default(""),
    canonicalUrl: text("canonical_url").notNull(),
    platform: text("platform", {
      enum: [
        CONTENT_PLATFORM.WEBSITE,
        CONTENT_PLATFORM.YOUTUBE,
        CONTENT_PLATFORM.PEERTUBE,
        CONTENT_PLATFORM.NEBULA,
      ],
    })
      .notNull()
      .default(CONTENT_PLATFORM.WEBSITE),
    contentType: text("content_type", {
      enum: [CONTENT_TYPE.TEXT, CONTENT_TYPE.VIDEO],
    })
      .notNull()
      .default(CONTENT_TYPE.TEXT),
    orientation: text("orientation", {
      enum: ["horizontal", "vertical"],
    }),
    contentId: text("content_id"),
    classificationSource: text("classification_source", {
      enum: [
        OBSERVATION_SOURCE.EXTENSION_LIVE_DOM,
        OBSERVATION_SOURCE.SERVER_STATIC_FETCH,
        OBSERVATION_SOURCE.URL,
      ],
    })
      .notNull()
      .default(OBSERVATION_SOURCE.URL),
    classifierVersion: integer("classifier_version").notNull().default(1),
    title: text("title").notNull().default(""),
    description: text("description"),
    author: text("author"),
    siteName: text("site_name"),
    publishedAt: integer("published_at", { mode: "timestamp" }),
    thumbnailUrl: text("thumbnail_url"),
    iconUrl: text("icon_url"),
    previewSource: text("preview_source", {
      enum: [
        OBSERVATION_SOURCE.EXTENSION_LIVE_DOM,
        OBSERVATION_SOURCE.SERVER_STATIC_FETCH,
        OBSERVATION_SOURCE.URL,
      ],
    })
      .notNull()
      .default(OBSERVATION_SOURCE.URL),
    isSaved: integer("is_saved", { mode: "boolean" }).notNull().default(true),
    isRead: integer("is_read", { mode: "boolean" }).notNull().default(false),
    progress: integer("progress", { mode: "number" }).notNull().default(0),
    duration: integer("duration", { mode: "number" }).notNull().default(0),
    savedUpdatedAt: integer("saved_updated_at", { mode: "timestamp" })
      .$default(() => new Date())
      .notNull(),
    readUpdatedAt: integer("read_updated_at", { mode: "timestamp" })
      .$default(() => new Date())
      .notNull(),
    progressUpdatedAt: integer("progress_updated_at", { mode: "timestamp" })
      .$default(() => new Date())
      .notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$default(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$default(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("bookmark_user_id_canonical_url_unique").on(
      table.userId,
      table.canonicalUrl,
    ),
    unique("bookmark_user_id_platform_content_id_unique").on(
      table.userId,
      table.platform,
      table.contentId,
    ),
    index("bookmark_user_id_idx").on(table.userId),
    index("bookmark_user_saved_saved_at_idx").on(
      table.userId,
      table.isSaved,
      table.savedUpdatedAt,
      table.id,
    ),
    index("bookmark_user_saved_read_read_at_idx").on(
      table.userId,
      table.isSaved,
      table.isRead,
      table.readUpdatedAt,
      table.id,
    ),
    index("bookmark_user_saved_read_created_at_idx").on(
      table.userId,
      table.isSaved,
      table.isRead,
      table.createdAt,
      table.id,
    ),
  ],
);

export const pageCaptures = sqliteTable("page_capture", {
  bookmarkId: text("bookmark_id")
    .primaryKey()
    .references(() => bookmarks.id, { onDelete: "cascade" }),
  contentHtml: text("content_html").notNull(),
  contentHash: text("content_hash").notNull(),
  captureSource: text("capture_source", {
    enum: ["extension-live-dom", "server-static-fetch"],
  }).notNull(),
  extractorVersion: text("extractor_version").notNull(),
  sanitizerPolicyVersion: integer("sanitizer_policy_version").notNull(),
  capturedAt: integer("captured_at", { mode: "timestamp" })
    .$default(() => new Date())
    .notNull(),
});

export const bookmarkSchema = createSelectSchema(bookmarks).merge(
  z.object({
    platform: contentPlatformSchema,
    contentType: contentTypeSchema,
    orientation: videoOrientationSchema.nullable(),
    classificationSource: observationSourceSchema,
    previewSource: observationSourceSchema,
  }),
);
export const pageCaptureSchema = createSelectSchema(pageCaptures);
export type DatabaseBookmark = typeof bookmarks.$inferSelect;
export type DatabasePageCapture = typeof pageCaptures.$inferSelect;

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
    contentFilter: integer("content_filter", { mode: "number" })
      .notNull()
      .default(DEFAULT_CONTENT_FILTER),
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

export const viewSchema = createSelectSchema(views).merge(
  z.object({ contentFilter: contentFilterSchema }),
);
export type DatabaseView = typeof views.$inferSelect;

export const viewSections = sqliteTable(
  "view_sections",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    viewId: integer("view_id")
      .notNull()
      .references(() => views.id, { onDelete: "cascade" }),
    placement: integer("placement", { mode: "number" }).notNull(),
    itemType: text("item_type", { length: 16 })
      .notNull()
      .default(VIEW_LAYOUT_ITEM_TYPE.FEED),
    itemId: integer("item_id", { mode: "number" }).notNull(),
    layout: text("layout", { length: 32 }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$default(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$default(() => new Date())
      .notNull(),
  },
  (table) => [
    index("view_sections_view_id_idx").on(table.viewId),
    index("view_sections_view_id_placement_idx").on(
      table.viewId,
      table.placement,
    ),
  ],
);
export type DatabaseViewSection = typeof viewSections.$inferSelect;

export const viewSectionSchema = createSelectSchema(viewSections).merge(
  z.object({
    itemType: viewLayoutItemTypeSchema,
  }),
);
export type ApplicationViewSection = z.infer<typeof viewSectionSchema>;

export const applicationViewSchema = createInsertSchema(views)
  .merge(
    z.object({
      categoryIds: z.array(z.number()),
      feedIds: z.array(z.number()),
      isDefault: z.boolean(),
      viewSections: z.array(viewSectionSchema),
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

export const bookmarkViews = sqliteTable(
  "bookmark_view",
  {
    bookmarkId: text("bookmark_id")
      .notNull()
      .references(() => bookmarks.id, { onDelete: "cascade" }),
    viewId: integer("view_id")
      .notNull()
      .references(() => views.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.bookmarkId, table.viewId] }),
    index("bookmark_view_view_id_idx").on(table.viewId),
  ],
);

export const bookmarkTags = sqliteTable(
  "bookmark_tag",
  {
    bookmarkId: text("bookmark_id")
      .notNull()
      .references(() => bookmarks.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => contentCategories.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.bookmarkId, table.tagId] }),
    index("bookmark_tag_tag_id_idx").on(table.tagId),
  ],
);

export const bookmarkRelations = relations(bookmarks, ({ one, many }) => ({
  user: one(user, {
    fields: [bookmarks.userId],
    references: [user.id],
  }),
  capture: one(pageCaptures),
  views: many(bookmarkViews),
  tags: many(bookmarkTags),
}));

export const pageCaptureRelations = relations(pageCaptures, ({ one }) => ({
  bookmark: one(bookmarks, {
    fields: [pageCaptures.bookmarkId],
    references: [bookmarks.id],
  }),
}));

export const bookmarkViewRelations = relations(bookmarkViews, ({ one }) => ({
  bookmark: one(bookmarks, {
    fields: [bookmarkViews.bookmarkId],
    references: [bookmarks.id],
  }),
  view: one(views, {
    fields: [bookmarkViews.viewId],
    references: [views.id],
  }),
}));

export const bookmarkTagRelations = relations(bookmarkTags, ({ one }) => ({
  bookmark: one(bookmarks, {
    fields: [bookmarkTags.bookmarkId],
    references: [bookmarks.id],
  }),
  tag: one(contentCategories, {
    fields: [bookmarkTags.tagId],
    references: [contentCategories.id],
  }),
}));

export type DatabaseBookmarkView = typeof bookmarkViews.$inferSelect;
export type DatabaseBookmarkTag = typeof bookmarkTags.$inferSelect;

export const viewSectionInputSchema = z.object({
  placement: z.number(),
  itemType: viewLayoutItemTypeSchema,
  itemId: z.number(),
  layout: viewLayoutSchema.optional().nullable(),
});

export const createViewSchema = createInsertSchema(views)
  .omit({ userId: true })
  .merge(
    z.object({
      readStatus: viewReadStatusSchema.optional(),
      contentFilter: contentFilterSchema.optional(),
      layout: viewLayoutSchema.optional(),
      daysWindow: z.number().lte(30).optional(),
      placement: z.number().gte(-1).optional(),
      categoryIds: boundedNumberIdsSchema.optional(),
      feedIds: boundedNumberIdsSchema.optional(),
      viewSections: z
        .array(viewSectionInputSchema)
        .max(MAX_BULK_MUTATION_ITEMS)
        .optional(),
    }),
  );

export const updateViewSchema = createUpdateSchema(views).merge(
  z.object({
    id: z.number(),
    categoryIds: boundedNumberIdsSchema,
    feedIds: boundedNumberIdsSchema,
    contentFilter: contentFilterSchema.optional(),
    layout: viewLayoutSchema.optional(),
    viewSections: z
      .array(viewSectionInputSchema)
      .max(MAX_BULK_MUTATION_ITEMS)
      .optional(),
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

// === AT Protocol OAuth ===

/**
 * In-flight AT Protocol authorization attempts, keyed by the OAuth `state`
 * parameter. The payload is an encrypted envelope (see server/auth/atproto)
 * holding the SDK's saved state: PKCE verifier, DPoP private key, issuer.
 * Rows are single-use — consumed at callback — and expire within the hour.
 */
export const atprotoAuthState = sqliteTable(
  "atproto_auth_state",
  {
    key: text("key").primaryKey(),
    payload: text("payload").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$default(() => new Date())
      .notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [index("atproto_auth_state_expires_at_idx").on(table.expiresAt)],
);

/**
 * Durable AT Protocol connections, keyed by DID. The `session` column is an
 * encrypted envelope holding the SDK's saved OAuth session (access + refresh
 * tokens and the DPoP private key); everything else is plaintext display and
 * bookkeeping data so no read path needs to decrypt. `userId` is null between
 * the OAuth callback persisting the session and the sign-in flow binding the
 * DID to a Serial user; unbound rows are swept with expired auth state.
 */
export const atprotoConnections = sqliteTable("atproto_connections", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  userId: text("user_id")
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  did: text("did").notNull().unique(),
  session: text("session"),
  /** Scope actually granted; null when the server omitted it. */
  scopes: text("scopes"),
  handle: text("handle"),
  pdsUrl: text("pds_url"),
  status: text("status")
    .$type<"active" | "disconnected">()
    .notNull()
    .default("active"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$default(() => new Date())
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$default(() => new Date())
    .notNull(),
});
export type DatabaseAtprotoConnection = typeof atprotoConnections.$inferSelect;

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
