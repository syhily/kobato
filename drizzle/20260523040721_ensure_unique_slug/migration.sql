CREATE TABLE "slug_registry" (
	"id" bigserial PRIMARY KEY,
	"slug" varchar(80) NOT NULL,
	"entity_type" varchar(16) NOT NULL,
	"entity_id" bigint NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_slug_registry_slug" ON "slug_registry" ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_slug_registry_entity" ON "slug_registry" ("entity_type","entity_id");