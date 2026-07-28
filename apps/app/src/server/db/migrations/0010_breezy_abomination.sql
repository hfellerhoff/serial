DROP INDEX "content_categories_name_idx";--> statement-breakpoint
DROP INDEX "feed_item_feed_id_idx";--> statement-breakpoint
DROP INDEX "feed_name_idx";--> statement-breakpoint
ALTER TABLE `serial_feed_item` ALTER COLUMN "is_vertical" TO "is_vertical" integer;--> statement-breakpoint
CREATE INDEX `content_categories_name_idx` ON `serial_content_categories` (`name`);--> statement-breakpoint
CREATE INDEX `feed_item_feed_id_idx` ON `serial_feed_item` (`feed_id`);--> statement-breakpoint
CREATE INDEX `feed_name_idx` ON `serial_feed` (`name`);