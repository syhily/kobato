ALTER TABLE "category" ADD COLUMN "og" text;--> statement-breakpoint
ALTER TABLE "tag" ADD COLUMN "og_image" text DEFAULT '' NOT NULL;