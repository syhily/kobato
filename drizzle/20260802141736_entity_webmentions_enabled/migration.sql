ALTER TABLE `page` ADD `webmentions_enabled` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `post` ADD `webmentions_enabled` integer DEFAULT true NOT NULL;