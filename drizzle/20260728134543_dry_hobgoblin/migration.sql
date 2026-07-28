ALTER TABLE "user" ADD COLUMN "login_method" varchar(16) DEFAULT 'password' NOT NULL;--> statement-breakpoint
-- Backfill: users who had passkey login forced keep it under the unified column.
UPDATE "user" SET "login_method" = 'passkey' WHERE "passkey_force" = true;--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "passkey_force";