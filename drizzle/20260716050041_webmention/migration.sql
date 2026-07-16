CREATE TYPE "webmention_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "webmention" (
	"id" bigserial PRIMARY KEY,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"source_url" text NOT NULL,
	"target_url" text NOT NULL,
	"status" "webmention_status" DEFAULT 'pending'::"webmention_status" NOT NULL,
	"target_type" varchar(16) NOT NULL,
	"target_owner_id" bigint NOT NULL,
	"fetched_at" timestamp with time zone,
	"author_name" varchar(200),
	"title" text,
	"summary" text,
	"raw_payload" jsonb DEFAULT '{}' NOT NULL,
	"moderated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "idx_webmention_status" ON "webmention" ("status");--> statement-breakpoint
CREATE INDEX "idx_webmention_target" ON "webmention" ("target_type","target_owner_id");