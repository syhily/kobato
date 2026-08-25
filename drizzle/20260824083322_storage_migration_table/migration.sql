CREATE TABLE `storage_migration` (
	`id` integer PRIMARY KEY,
	`direction` text NOT NULL,
	`target_storage` text,
	`phase` text NOT NULL,
	`cursor` text,
	`copied_objects` integer DEFAULT 0 NOT NULL,
	`copied_bytes` integer DEFAULT 0 NOT NULL,
	`skipped_objects` integer DEFAULT 0 NOT NULL,
	`error` text,
	`started_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`finished_at` integer,
	CONSTRAINT "storage_migration_singleton_chk" CHECK("id" = 1),
	CONSTRAINT "storage_migration_direction_chk" CHECK("direction" IN ('local-to-s3', 's3-to-local', 's3-to-s3')),
	CONSTRAINT "storage_migration_phase_chk" CHECK("phase" IN ('copying', 'switching', 'catching-up', 'completed', 'failed', 'cancelled'))
);
