CREATE EXTENSION IF NOT EXISTS pgcrypto;--> statement-breakpoint
ALTER TABLE "comment" ADD COLUMN "content_hash" varchar(64);--> statement-breakpoint
UPDATE "comment" SET "content_hash" = encode(digest(COALESCE("content", ''), 'sha256'), 'hex') WHERE "content_hash" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_comment_content_hash" ON "comment" ("content_hash");