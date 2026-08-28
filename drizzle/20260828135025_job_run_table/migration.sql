CREATE TABLE `job_run` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`task_key` text NOT NULL,
	`trigger` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`duration_ms` integer,
	`error` text,
	CONSTRAINT "job_run_trigger_chk" CHECK("trigger" IN ('scheduled', 'manual')),
	CONSTRAINT "job_run_status_chk" CHECK("status" IN ('running', 'success', 'failed', 'cancelled'))
);
--> statement-breakpoint
CREATE INDEX `idx_job_run_task_started` ON `job_run` (`task_key`,`started_at`);