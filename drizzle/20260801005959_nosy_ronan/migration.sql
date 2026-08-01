CREATE TABLE `webmention_outbox` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`source_url` text NOT NULL,
	`target_url` text NOT NULL,
	`endpoint` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_retry_at` integer,
	`last_error` text,
	`sent_at` integer,
	CONSTRAINT "webmention_outbox_status_chk" CHECK("status" IN ('pending', 'sent', 'no-endpoint', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_webmention_outbox_pair` ON `webmention_outbox` (`source_url`,`target_url`);--> statement-breakpoint
CREATE INDEX `idx_webmention_outbox_pick` ON `webmention_outbox` (`status`,`next_retry_at`);--> statement-breakpoint
CREATE INDEX `idx_webmention_outbox_source` ON `webmention_outbox` (`source_url`);