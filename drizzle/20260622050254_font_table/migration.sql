CREATE TABLE "font" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"family_name" text NOT NULL,
	"source_name" text NOT NULL,
	"hash" text NOT NULL UNIQUE,
	"css_key" text NOT NULL,
	"storage_driver" text NOT NULL,
	"chunk_count" integer NOT NULL,
	"total_bytes" bigint NOT NULL,
	"etag" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "font_storage_driver_chk" CHECK ("storage_driver" IN ('s3', 'local'))
);
--> statement-breakpoint
CREATE INDEX "font_family_idx" ON "font" ("family_name");
