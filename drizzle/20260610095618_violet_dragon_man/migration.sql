UPDATE "comment" SET "vote_up" = 0 WHERE "vote_up" IS NULL;--> statement-breakpoint
UPDATE "comment" SET "vote_down" = 0 WHERE "vote_down" IS NULL;--> statement-breakpoint
ALTER TABLE "comment" ALTER COLUMN "vote_up" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "comment" ALTER COLUMN "vote_up" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "comment" ALTER COLUMN "vote_down" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "comment" ALTER COLUMN "vote_down" SET NOT NULL;