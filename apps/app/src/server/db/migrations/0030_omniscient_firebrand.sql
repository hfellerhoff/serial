ALTER TABLE `serial_session` ADD `impersonated_by` text;--> statement-breakpoint
ALTER TABLE `serial_user` ADD `role` text;--> statement-breakpoint
ALTER TABLE `serial_user` ADD `banned` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `serial_user` ADD `ban_reason` text;--> statement-breakpoint
ALTER TABLE `serial_user` ADD `ban_expires` integer;