DROP INDEX "content_categories_name_idx";--> statement-breakpoint
DROP INDEX "feed_item_id_idx";--> statement-breakpoint
DROP INDEX "serial_feed_item_url_feed_id_unique";--> statement-breakpoint
DROP INDEX "feed_name_idx";--> statement-breakpoint
DROP INDEX "serial_instapaper_connections_user_id_unique";--> statement-breakpoint
DROP INDEX "serial_session_token_unique";--> statement-breakpoint
DROP INDEX "serial_user_email_unique";--> statement-breakpoint
DROP INDEX "serial_user_config_user_id_unique";--> statement-breakpoint
DROP INDEX "view_name_idx";--> statement-breakpoint
ALTER TABLE `serial_views` ALTER COLUMN "days_window" TO "days_window" integer NOT NULL DEFAULT 0;--> statement-breakpoint
CREATE INDEX `content_categories_name_idx` ON `serial_content_categories` (`name`);--> statement-breakpoint
CREATE INDEX `feed_item_id_idx` ON `serial_feed_item` (`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `serial_feed_item_url_feed_id_unique` ON `serial_feed_item` (`url`,`feed_id`);--> statement-breakpoint
CREATE INDEX `feed_name_idx` ON `serial_feed` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `serial_instapaper_connections_user_id_unique` ON `serial_instapaper_connections` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `serial_session_token_unique` ON `serial_session` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `serial_user_email_unique` ON `serial_user` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `serial_user_config_user_id_unique` ON `serial_user_config` (`user_id`);--> statement-breakpoint
CREATE INDEX `view_name_idx` ON `serial_views` (`name`);