CREATE TABLE `serial_view_sections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`view_id` integer NOT NULL,
	`placement` integer NOT NULL,
	`name` text(256) DEFAULT '' NOT NULL,
	`item_type` text(16) DEFAULT 'feed' NOT NULL,
	`item_id` integer NOT NULL,
	`layout` text(32),
	`content_type` text(32),
	`days_window` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`view_id`) REFERENCES `serial_views`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `view_sections_view_id_idx` ON `serial_view_sections` (`view_id`);--> statement-breakpoint
CREATE INDEX `view_sections_view_id_placement_idx` ON `serial_view_sections` (`view_id`,`placement`);