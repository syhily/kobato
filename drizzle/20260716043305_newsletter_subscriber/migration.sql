DO $$ BEGIN
	CREATE TYPE "newsletter_subscriber_status" AS ENUM('pending', 'confirmed', 'unsubscribed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE TABLE "newsletter_subscriber" (
	"id" bigserial PRIMARY KEY,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"email" varchar(255) NOT NULL,
	"status" "newsletter_subscriber_status" NOT NULL,
	"confirm_token_hash" text,
	"confirm_token_expires_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_newsletter_subscriber_email" ON "newsletter_subscriber" ("email");--> statement-breakpoint
CREATE INDEX "idx_newsletter_subscriber_status" ON "newsletter_subscriber" ("status");--> statement-breakpoint
CREATE INDEX "idx_newsletter_subscriber_confirm_token_hash" ON "newsletter_subscriber" ("confirm_token_hash");