-- Enable pg_trgm and add a GIN trigram index on post_search_index.plain_text.
--
-- Hand-written because drizzle-kit models neither extensions nor
-- operator-class index DDL (same precedent as
-- 20260514000003_access_log_timescale). The index accelerates the new
-- 'trgm' search mode and, as a side benefit, the existing LIKE '%…%'
-- fallback on plain_text (pg_trgm GIN supports both).
--
-- Plain CREATE INDEX (not CONCURRENTLY): drizzle's migrator runs every
-- migration inside a transaction, where CONCURRENTLY is forbidden. The
-- table is small at personal-blog scale, so the brief write lock is
-- acceptable.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_post_search_plain_text_trgm
  ON post_search_index USING gin (plain_text gin_trgm_ops);
