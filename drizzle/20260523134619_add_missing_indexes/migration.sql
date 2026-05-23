CREATE INDEX "idx_comment_thread" ON "comment" ("type","owner_id","root_id");--> statement-breakpoint
CREATE INDEX "idx_page_catalog" ON "page" ("deleted_at","published","first_published_at");--> statement-breakpoint
CREATE INDEX "idx_post_catalog" ON "post" ("deleted_at","published","first_published_at");