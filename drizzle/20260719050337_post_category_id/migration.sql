ALTER TABLE "post" ADD COLUMN "category_id" bigint;--> statement-breakpoint
-- Backfill from the legacy denormalized name column. category.name is
-- UNIQUE, so the join is unambiguous; names with no matching category
-- row and the '' "no category" sentinel stay NULL.
UPDATE "post" SET "category_id" = "category"."id" FROM "category" WHERE "post"."category" = "category"."name";--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_category_id_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX "idx_post_category_id" ON "post" USING btree ("category_id");--> statement-breakpoint
ALTER TABLE "post" DROP COLUMN "category";
