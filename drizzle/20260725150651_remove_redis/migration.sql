CREATE TABLE "kv_cache" (
	"key" text PRIMARY KEY,
	"bucket" text NOT NULL,
	"value" jsonb,
	"blob" bytea,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "one_time_token" (
	"key" text PRIMARY KEY,
	"payload" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY,
	"user_id" bigint,
	"data" jsonb NOT NULL,
	"user_agent" text,
	"platform_hint" text,
	"ip" inet,
	"login_at" timestamp with time zone,
	"last_active_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_kv_cache_bucket" ON "kv_cache" ("bucket");--> statement-breakpoint
CREATE INDEX "idx_kv_cache_expires_at" ON "kv_cache" ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_one_time_token_expires_at" ON "one_time_token" ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_session_user_id" ON "session" ("user_id");--> statement-breakpoint
CREATE INDEX "idx_session_expires_at" ON "session" ("expires_at");--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;