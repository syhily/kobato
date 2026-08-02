-- Dedupe before the unique index: re-mentions stored under URL variants
-- that `normalizeForMatch` collapses (fragment, default port, path
-- trailing slashes — scheme and query stay distinct) must fold into one
-- row or the CREATE UNIQUE INDEX below would fail. The grouping key
-- below APPROXIMATES that normalization's equality classes, with two
-- known residuals: it does not lowercase scheme/host (the `URL` parser
-- lowercases both, but rows written since `normalizeForMatch` guards
-- the column are lowercase already, so only mixed-case legacy rows can
-- slip through), and it does not converge the pathless
-- `http://host:port?query` shape (the authority extraction absorbs the
-- `?query`, so the default-port strip misses it). Either residual just
-- leaves a duplicate behind — the unique index below still holds. Each
-- group keeps the MAX(id) row (ids autoincrement in insertion order, so
-- it is the latest created_at).
WITH nofrag AS (
  SELECT id, target_url,
         CASE WHEN instr(source_url, '#') > 0
              THEN substr(source_url, 1, instr(source_url, '#') - 1)
              ELSE source_url
         END AS url
  FROM webmention
),
auth AS (
  SELECT id, target_url, url,
         CASE
           WHEN url LIKE 'http://%' THEN
             CASE WHEN instr(substr(url, 8), '/') = 0 THEN substr(url, 8)
                  ELSE substr(url, 8, instr(substr(url, 8), '/') - 1) END
           WHEN url LIKE 'https://%' THEN
             CASE WHEN instr(substr(url, 9), '/') = 0 THEN substr(url, 9)
                  ELSE substr(url, 9, instr(substr(url, 9), '/') - 1) END
           ELSE ''
         END AS authority
  FROM nofrag
),
noport AS (
  SELECT id, target_url,
         CASE
           WHEN url LIKE 'http://%' AND authority LIKE '%:80'
             THEN substr(url, 1, 7) || substr(authority, 1, length(authority) - 3) || substr(url, 8 + length(authority))
           WHEN url LIKE 'https://%' AND authority LIKE '%:443'
             THEN substr(url, 1, 8) || substr(authority, 1, length(authority) - 4) || substr(url, 9 + length(authority))
           ELSE url
         END AS url
  FROM auth
),
keyed AS (
  SELECT id, target_url,
         CASE WHEN instr(url, '?') > 0
              THEN rtrim(substr(url, 1, instr(url, '?') - 1), '/') || substr(url, instr(url, '?'))
              ELSE rtrim(url, '/')
         END AS src_key
  FROM noport
)
DELETE FROM webmention
WHERE id NOT IN (SELECT MAX(id) FROM keyed GROUP BY target_url, src_key);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_webmention_pair` ON `webmention` (`source_url`,`target_url`);
