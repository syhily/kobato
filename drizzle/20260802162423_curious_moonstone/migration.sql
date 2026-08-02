ALTER TABLE `webmention` ADD `verification_status` text DEFAULT 'verified' NOT NULL;--> statement-breakpoint
ALTER TABLE `webmention` ADD `last_verified_at` integer;--> statement-breakpoint
ALTER TABLE `webmention` ADD `last_error` text;--> statement-breakpoint
ALTER TABLE `webmention` ADD `verify_fail_streak` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_webmention` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`source_url` text NOT NULL,
	`target_url` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`type` text DEFAULT 'mention' NOT NULL,
	`target_type` text NOT NULL,
	`target_owner_id` integer NOT NULL,
	`fetched_at` integer,
	`verification_status` text DEFAULT 'verified' NOT NULL,
	`last_verified_at` integer,
	`last_error` text,
	`verify_fail_streak` integer DEFAULT 0 NOT NULL,
	`author_name` text,
	`title` text,
	`summary` text,
	`raw_payload` text NOT NULL,
	`moderated_at` integer,
	CONSTRAINT "webmention_status_chk" CHECK("status" IN ('pending', 'approved', 'rejected', 'hidden')),
	CONSTRAINT "webmention_type_chk" CHECK("type" IN ('mention', 'reply', 'like', 'repost')),
	CONSTRAINT "webmention_verification_chk" CHECK("verification_status" IN ('verified', 'failed'))
);
--> statement-breakpoint
INSERT INTO `__new_webmention`(`id`, `created_at`, `updated_at`, `source_url`, `target_url`, `status`, `type`, `target_type`, `target_owner_id`, `fetched_at`, `author_name`, `title`, `summary`, `raw_payload`, `moderated_at`) SELECT `id`, `created_at`, `updated_at`, `source_url`, `target_url`, `status`, `type`, `target_type`, `target_owner_id`, `fetched_at`, `author_name`, `title`, `summary`, `raw_payload`, `moderated_at` FROM `webmention`;--> statement-breakpoint
DROP TABLE `webmention`;--> statement-breakpoint
ALTER TABLE `__new_webmention` RENAME TO `webmention`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_webmention_pair` ON `webmention` (`source_url`,`target_url`);--> statement-breakpoint
CREATE INDEX `idx_webmention_status` ON `webmention` (`status`);--> statement-breakpoint
CREATE INDEX `idx_webmention_target` ON `webmention` (`target_type`,`target_owner_id`);--> statement-breakpoint
-- Backfill the verification waterline from the receive-time fetch (the
-- only meaningful timestamp legacy rows carry), so the first daily
-- re-verification run starts from a sane baseline instead of treating
-- every row as immediately due.
UPDATE `webmention` SET `last_verified_at` = COALESCE(`fetched_at`, `created_at`);