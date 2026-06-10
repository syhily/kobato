CREATE TABLE "post_tag" (
	"post_id" bigint,
	"tag_id" bigint,
	CONSTRAINT "post_tag_pkey" PRIMARY KEY("post_id","tag_id")
);
--> statement-breakpoint
-- Backfill the junction table from the legacy JSONB `post.tags` array.
-- Tags without a matching `tag` row are silently ignored (they were not
-- reachable from the admin taxonomy UI anyway).
INSERT INTO "post_tag" ("post_id", "tag_id")
SELECT p.id, t.id
FROM "post" p,
LATERAL jsonb_array_elements_text(p.tags) AS tag_name
INNER JOIN "tag" t ON t.name = tag_name
ON CONFLICT DO NOTHING;
--> statement-breakpoint
ALTER TABLE "post" DROP COLUMN "tags";--> statement-breakpoint
ALTER TABLE "post_tag" ADD CONSTRAINT "post_tag_post_id_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "post"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "post_tag" ADD CONSTRAINT "post_tag_tag_id_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tag"("id") ON DELETE CASCADE;