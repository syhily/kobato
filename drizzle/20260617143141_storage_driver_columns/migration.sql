CREATE TABLE "backup" (
	"id" bigserial PRIMARY KEY,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"timestamp" varchar(32) NOT NULL,
	"storage_path" varchar(500) NOT NULL,
	"storage_driver" varchar(8) DEFAULT 's3' NOT NULL,
	"byte_size" bigint NOT NULL,
	"created_by" bigint,
	CONSTRAINT "backup_storage_driver_chk" CHECK ("storage_driver" IN ('s3', 'local'))
);
--> statement-breakpoint
ALTER TABLE "image" ADD COLUMN "storage_driver" varchar(8) DEFAULT 's3' NOT NULL;--> statement-breakpoint
ALTER TABLE "music" ADD COLUMN "storage_driver" varchar(8) DEFAULT 's3' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_backup_storage_path" ON "backup" ("storage_path");--> statement-breakpoint
CREATE INDEX "idx_backup_created_at" ON "backup" ("created_at");--> statement-breakpoint
ALTER TABLE "image" ADD CONSTRAINT "image_storage_driver_chk" CHECK ("storage_driver" IN ('s3', 'local'));--> statement-breakpoint
ALTER TABLE "music" ADD CONSTRAINT "music_storage_driver_chk" CHECK ("storage_driver" IN ('s3', 'local'));