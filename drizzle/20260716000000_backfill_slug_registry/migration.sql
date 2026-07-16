-- Backfill existing page/post slugs into the registry (corrective migration:
-- this content originally shipped in a seed.sql the migrator never runs).
INSERT INTO "slug_registry" ("slug", "entity_type", "entity_id", "created_at")
SELECT "slug", 'page', "id", NOW()
FROM "page"
WHERE "deleted_at" IS NULL
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "slug_registry" ("slug", "entity_type", "entity_id", "created_at")
SELECT "slug", 'post', "id", NOW()
FROM "post"
WHERE "deleted_at" IS NULL
ON CONFLICT ("slug") DO NOTHING;
