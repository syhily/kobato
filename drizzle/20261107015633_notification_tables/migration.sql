CREATE TABLE `notification` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`thread_id` integer NOT NULL,
	`kind` text NOT NULL,
	`sender_id` integer,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`replyable` integer DEFAULT false NOT NULL,
	`source` text,
	`action_url` text,
	`created_at` integer NOT NULL,
	CONSTRAINT "notification_kind_chk" CHECK("kind" IN ('direct', 'admin', 'broadcast'))
);
--> statement-breakpoint
CREATE TABLE `notification_recipient` (
	`notification_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`read_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_notification_thread` ON `notification` (`thread_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_notification_recipient` ON `notification_recipient` (`notification_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_notification_recipient_user` ON `notification_recipient` (`user_id`,`read_at`);