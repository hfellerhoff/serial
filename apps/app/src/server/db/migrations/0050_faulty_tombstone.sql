DROP INDEX "account_user_id_idx";--> statement-breakpoint
DROP INDEX "atproto_auth_state_expires_at_idx";--> statement-breakpoint
DROP INDEX "serial_atproto_connections_user_id_unique";--> statement-breakpoint
DROP INDEX "serial_atproto_connections_did_unique";--> statement-breakpoint
DROP INDEX "bookmark_tag_tag_id_idx";--> statement-breakpoint
DROP INDEX "bookmark_view_view_id_idx";--> statement-breakpoint
DROP INDEX "bookmark_user_id_idx";--> statement-breakpoint
DROP INDEX "bookmark_user_saved_saved_at_idx";--> statement-breakpoint
DROP INDEX "bookmark_user_saved_read_read_at_idx";--> statement-breakpoint
DROP INDEX "bookmark_user_saved_read_created_at_idx";--> statement-breakpoint
DROP INDEX "bookmark_user_id_canonical_url_unique";--> statement-breakpoint
DROP INDEX "bookmark_user_id_platform_content_id_unique";--> statement-breakpoint
DROP INDEX "content_categories_user_id_name_idx";--> statement-breakpoint
DROP INDEX "serial_extension_session_token_hash_unique";--> statement-breakpoint
DROP INDEX "extension_session_user_id_idx";--> statement-breakpoint
DROP INDEX "extension_session_expires_at_idx";--> statement-breakpoint
DROP INDEX "feed_categories_category_id_idx";--> statement-breakpoint
DROP INDEX "feed_item_feed_id_posted_at_idx";--> statement-breakpoint
DROP INDEX "feed_item_feed_id_visibility_posted_at_idx";--> statement-breakpoint
DROP INDEX "feed_item_feed_id_is_watch_later_posted_at_idx";--> statement-breakpoint
DROP INDEX "feed_item_feed_id_is_watched_updated_at_idx";--> statement-breakpoint
DROP INDEX "serial_feed_item_url_feed_id_unique";--> statement-breakpoint
DROP INDEX "feed_user_id_idx";--> statement-breakpoint
DROP INDEX "feed_user_id_url_idx";--> statement-breakpoint
DROP INDEX "feed_user_id_is_active_idx";--> statement-breakpoint
DROP INDEX "feed_user_id_is_active_next_fetch_at_idx";--> statement-breakpoint
DROP INDEX "serial_instapaper_connections_user_id_unique";--> statement-breakpoint
DROP INDEX "serial_invitation_token_unique";--> statement-breakpoint
DROP INDEX "invitation_inviter_id_idx";--> statement-breakpoint
DROP INDEX "invitation_redemption_invitation_id_idx";--> statement-breakpoint
DROP INDEX "serial_session_token_unique";--> statement-breakpoint
DROP INDEX "session_user_id_idx";--> statement-breakpoint
DROP INDEX "session_created_at_idx";--> statement-breakpoint
DROP INDEX "serial_user_email_unique";--> statement-breakpoint
DROP INDEX "user_created_at_idx";--> statement-breakpoint
DROP INDEX "user_next_refresh_at_idx";--> statement-breakpoint
DROP INDEX "serial_user_config_user_id_unique";--> statement-breakpoint
DROP INDEX "view_categories_view_id_idx";--> statement-breakpoint
DROP INDEX "view_categories_category_id_idx";--> statement-breakpoint
DROP INDEX "view_feeds_view_id_idx";--> statement-breakpoint
DROP INDEX "view_feeds_feed_id_idx";--> statement-breakpoint
DROP INDEX "view_sections_view_id_idx";--> statement-breakpoint
DROP INDEX "view_sections_view_id_placement_idx";--> statement-breakpoint
DROP INDEX "view_user_id_idx";--> statement-breakpoint
DROP INDEX "view_user_id_placement_idx";--> statement-breakpoint
ALTER TABLE `serial_atproto_connections` ALTER COLUMN "scopes" TO "scopes" text;--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `serial_account` (`user_id`);--> statement-breakpoint
CREATE INDEX `atproto_auth_state_expires_at_idx` ON `serial_atproto_auth_state` (`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `serial_atproto_connections_user_id_unique` ON `serial_atproto_connections` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `serial_atproto_connections_did_unique` ON `serial_atproto_connections` (`did`);--> statement-breakpoint
CREATE INDEX `bookmark_tag_tag_id_idx` ON `serial_bookmark_tag` (`tag_id`);--> statement-breakpoint
CREATE INDEX `bookmark_view_view_id_idx` ON `serial_bookmark_view` (`view_id`);--> statement-breakpoint
CREATE INDEX `bookmark_user_id_idx` ON `serial_bookmark` (`user_id`);--> statement-breakpoint
CREATE INDEX `bookmark_user_saved_saved_at_idx` ON `serial_bookmark` (`user_id`,`is_saved`,`saved_updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `bookmark_user_saved_read_read_at_idx` ON `serial_bookmark` (`user_id`,`is_saved`,`is_read`,`read_updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `bookmark_user_saved_read_created_at_idx` ON `serial_bookmark` (`user_id`,`is_saved`,`is_read`,`created_at`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bookmark_user_id_canonical_url_unique` ON `serial_bookmark` (`user_id`,`canonical_url`);--> statement-breakpoint
CREATE UNIQUE INDEX `bookmark_user_id_platform_content_id_unique` ON `serial_bookmark` (`user_id`,`platform`,`content_id`);--> statement-breakpoint
CREATE INDEX `content_categories_user_id_name_idx` ON `serial_content_categories` (`user_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `serial_extension_session_token_hash_unique` ON `serial_extension_session` (`token_hash`);--> statement-breakpoint
CREATE INDEX `extension_session_user_id_idx` ON `serial_extension_session` (`user_id`);--> statement-breakpoint
CREATE INDEX `extension_session_expires_at_idx` ON `serial_extension_session` (`expires_at`);--> statement-breakpoint
CREATE INDEX `feed_categories_category_id_idx` ON `serial_feed_categories` (`category_id`);--> statement-breakpoint
CREATE INDEX `feed_item_feed_id_posted_at_idx` ON `serial_feed_item` (`feed_id`,`posted_at`);--> statement-breakpoint
CREATE INDEX `feed_item_feed_id_visibility_posted_at_idx` ON `serial_feed_item` (`feed_id`,`is_watched`,`is_watch_later`,`posted_at`);--> statement-breakpoint
CREATE INDEX `feed_item_feed_id_is_watch_later_posted_at_idx` ON `serial_feed_item` (`feed_id`,`is_watch_later`,`posted_at`);--> statement-breakpoint
CREATE INDEX `feed_item_feed_id_is_watched_updated_at_idx` ON `serial_feed_item` (`feed_id`,`is_watched`,`is_watched_updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `serial_feed_item_url_feed_id_unique` ON `serial_feed_item` (`url`,`feed_id`);--> statement-breakpoint
CREATE INDEX `feed_user_id_idx` ON `serial_feed` (`user_id`);--> statement-breakpoint
CREATE INDEX `feed_user_id_url_idx` ON `serial_feed` (`user_id`,`url`);--> statement-breakpoint
CREATE INDEX `feed_user_id_is_active_idx` ON `serial_feed` (`user_id`,`is_active`,`last_fetched_at`);--> statement-breakpoint
CREATE INDEX `feed_user_id_is_active_next_fetch_at_idx` ON `serial_feed` (`user_id`,`is_active`,`next_fetch_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `serial_instapaper_connections_user_id_unique` ON `serial_instapaper_connections` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `serial_invitation_token_unique` ON `serial_invitation` (`token`);--> statement-breakpoint
CREATE INDEX `invitation_inviter_id_idx` ON `serial_invitation` (`inviter_id`);--> statement-breakpoint
CREATE INDEX `invitation_redemption_invitation_id_idx` ON `serial_invitation_redemption` (`invitation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `serial_session_token_unique` ON `serial_session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `serial_session` (`user_id`);--> statement-breakpoint
CREATE INDEX `session_created_at_idx` ON `serial_session` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `serial_user_email_unique` ON `serial_user` (`email`);--> statement-breakpoint
CREATE INDEX `user_created_at_idx` ON `serial_user` (`created_at`);--> statement-breakpoint
CREATE INDEX `user_next_refresh_at_idx` ON `serial_user` (`next_refresh_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `serial_user_config_user_id_unique` ON `serial_user_config` (`user_id`);--> statement-breakpoint
CREATE INDEX `view_categories_view_id_idx` ON `serial_view_categories` (`view_id`);--> statement-breakpoint
CREATE INDEX `view_categories_category_id_idx` ON `serial_view_categories` (`category_id`);--> statement-breakpoint
CREATE INDEX `view_feeds_view_id_idx` ON `serial_view_feeds` (`view_id`);--> statement-breakpoint
CREATE INDEX `view_feeds_feed_id_idx` ON `serial_view_feeds` (`feed_id`);--> statement-breakpoint
CREATE INDEX `view_sections_view_id_idx` ON `serial_view_sections` (`view_id`);--> statement-breakpoint
CREATE INDEX `view_sections_view_id_placement_idx` ON `serial_view_sections` (`view_id`,`placement`);--> statement-breakpoint
CREATE INDEX `view_user_id_idx` ON `serial_views` (`user_id`);--> statement-breakpoint
CREATE INDEX `view_user_id_placement_idx` ON `serial_views` (`user_id`,`placement`);