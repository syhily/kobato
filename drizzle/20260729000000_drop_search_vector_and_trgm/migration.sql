-- Drop the pgvector embedding column (with its HNSW index) and the
-- pg_trgm GIN index from post_search_index: the vector and trgm search
-- modes were removed, search is LIKE-only.
--
-- Hand-written (operator-class index DDL), same precedent as
-- 20260716052903_enable_pg_trgm. The extensions themselves stay
-- installed — harmless, and other databases on the same server may use
-- them.

DROP INDEX IF EXISTS idx_post_search_embedding;
--> statement-breakpoint

DROP INDEX IF EXISTS idx_post_search_plain_text_trgm;
--> statement-breakpoint

ALTER TABLE post_search_index DROP COLUMN IF EXISTS embedding;
