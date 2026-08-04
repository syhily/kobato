CREATE TABLE `api_key` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`public_key` text NOT NULL,
	`scopes` text NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_api_key_created_at` ON `api_key` (`created_at`);