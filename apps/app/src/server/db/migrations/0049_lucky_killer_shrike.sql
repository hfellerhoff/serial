ALTER TABLE `serial_feed_item` ADD `normalized_url` text(4096);--> statement-breakpoint
ALTER TABLE `serial_views` RENAME COLUMN "content_type" TO "content_filter";--> statement-breakpoint
UPDATE `serial_views`
SET `content_filter` = CASE `content_filter`
	WHEN 'longform' THEN 3
	WHEN 'horizontal-video' THEN 2
	WHEN 'vertical-video' THEN 4
	WHEN 'all' THEN 7
	ELSE 3
END;--> statement-breakpoint
DROP INDEX "account_user_id_idx";--> statement-breakpoint
DROP INDEX "bookmark_tag_tag_id_idx";--> statement-breakpoint
DROP INDEX "bookmark_view_view_id_idx";--> statement-breakpoint
DROP INDEX "bookmark_user_id_idx";--> statement-breakpoint
DROP INDEX "bookmark_user_id_canonical_url_unique";--> statement-breakpoint
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
ALTER TABLE `serial_views` ALTER COLUMN "content_filter" TO "content_filter" integer NOT NULL DEFAULT 3;--> statement-breakpoint
UPDATE `serial_views`
SET `content_filter` = CAST(`content_filter` AS integer);--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `serial_account` (`user_id`);--> statement-breakpoint
CREATE INDEX `bookmark_tag_tag_id_idx` ON `serial_bookmark_tag` (`tag_id`);--> statement-breakpoint
CREATE INDEX `bookmark_view_view_id_idx` ON `serial_bookmark_view` (`view_id`);--> statement-breakpoint
CREATE INDEX `bookmark_user_id_idx` ON `serial_bookmark` (`user_id`);--> statement-breakpoint
CREATE INDEX `bookmark_user_saved_saved_at_idx` ON `serial_bookmark` (`user_id`,`is_saved`,`saved_updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `bookmark_user_saved_read_read_at_idx` ON `serial_bookmark` (`user_id`,`is_saved`,`is_read`,`read_updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `bookmark_user_saved_read_created_at_idx` ON `serial_bookmark` (`user_id`,`is_saved`,`is_read`,`created_at`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bookmark_user_id_canonical_url_unique` ON `serial_bookmark` (`user_id`,`canonical_url`);--> statement-breakpoint
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
CREATE INDEX `view_user_id_placement_idx` ON `serial_views` (`user_id`,`placement`);--> statement-breakpoint
ALTER TABLE `serial_views` DROP COLUMN `orientation`;--> statement-breakpoint
ALTER TABLE `serial_bookmark` ADD `effective_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `serial_bookmark` ADD `platform` text DEFAULT 'website' NOT NULL;--> statement-breakpoint
ALTER TABLE `serial_bookmark` ADD `content_type` text DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE `serial_bookmark` ADD `orientation` text;--> statement-breakpoint
ALTER TABLE `serial_bookmark` ADD `content_id` text;--> statement-breakpoint
ALTER TABLE `serial_bookmark` ADD `classification_source` text DEFAULT 'url' NOT NULL;--> statement-breakpoint
ALTER TABLE `serial_bookmark` ADD `classifier_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `serial_bookmark` ADD `title` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `serial_bookmark` ADD `description` text;--> statement-breakpoint
ALTER TABLE `serial_bookmark` ADD `author` text;--> statement-breakpoint
ALTER TABLE `serial_bookmark` ADD `site_name` text;--> statement-breakpoint
ALTER TABLE `serial_bookmark` ADD `published_at` integer;--> statement-breakpoint
ALTER TABLE `serial_bookmark` ADD `thumbnail_url` text;--> statement-breakpoint
ALTER TABLE `serial_bookmark` ADD `icon_url` text;--> statement-breakpoint
ALTER TABLE `serial_bookmark` ADD `preview_source` text DEFAULT 'url' NOT NULL;--> statement-breakpoint
UPDATE `serial_bookmark`
SET
	`effective_url` = COALESCE(
		NULLIF((SELECT `effective_url` FROM `serial_page_capture` WHERE `bookmark_id` = `serial_bookmark`.`id`), ''),
		`canonical_url`,
		`source_url`
	),
	`title` = COALESCE(
		NULLIF((SELECT `title` FROM `serial_page_capture` WHERE `bookmark_id` = `serial_bookmark`.`id`), ''),
		`source_url`
	),
	`author` = (SELECT `author` FROM `serial_page_capture` WHERE `bookmark_id` = `serial_bookmark`.`id`),
	`published_at` = (SELECT `published_at` FROM `serial_page_capture` WHERE `bookmark_id` = `serial_bookmark`.`id`),
	`icon_url` = (SELECT `icon_url` FROM `serial_page_capture` WHERE `bookmark_id` = `serial_bookmark`.`id`),
	`thumbnail_url` = (SELECT `representative_image_url` FROM `serial_page_capture` WHERE `bookmark_id` = `serial_bookmark`.`id`),
	`preview_source` = COALESCE(
		(SELECT `capture_source` FROM `serial_page_capture` WHERE `bookmark_id` = `serial_bookmark`.`id`),
		'url'
	);--> statement-breakpoint
CREATE UNIQUE INDEX `bookmark_user_id_platform_content_id_unique` ON `serial_bookmark` (`user_id`,`platform`,`content_id`);--> statement-breakpoint
ALTER TABLE `serial_feed_item` ADD `content_type` text DEFAULT 'text' NOT NULL;--> statement-breakpoint
UPDATE `serial_feed_item`
SET `content_type` = CASE (
	SELECT `platform`
	FROM `serial_feed`
	WHERE `serial_feed`.`id` = `serial_feed_item`.`feed_id`
)
	WHEN 'website' THEN 'text'
	ELSE 'video'
END;--> statement-breakpoint
ALTER TABLE `serial_page_capture` DROP COLUMN `title`;--> statement-breakpoint
ALTER TABLE `serial_page_capture` DROP COLUMN `author`;--> statement-breakpoint
ALTER TABLE `serial_page_capture` DROP COLUMN `published_at`;--> statement-breakpoint
ALTER TABLE `serial_page_capture` DROP COLUMN `effective_url`;--> statement-breakpoint
ALTER TABLE `serial_page_capture` DROP COLUMN `icon_url`;--> statement-breakpoint
ALTER TABLE `serial_page_capture` DROP COLUMN `representative_image_url`;
