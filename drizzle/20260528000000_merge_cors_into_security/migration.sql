-- Merge the standalone `blog.cors` section into `blog.security`.
-- After this migration the `cors` settings section is retired;
-- CORS configuration lives on `blog.security` alongside CSRF.

-- Step 1: When both rows exist, merge cors data into security.
UPDATE "setting" AS sec
SET "data" = sec."data" || jsonb_build_object(
  'cors', COALESCE(cors_row."data"->'cors', '{"enabled":false,"origins":[]}'::jsonb)
)
FROM "setting" AS cors_row
WHERE sec."scope" = 'blog.security'
  AND cors_row."scope" = 'blog.cors';

-- Step 2: When only blog.cors exists, create blog.security with defaults + migrated cors.
INSERT INTO "setting" ("scope", "data", "updated_at", "updated_by")
SELECT 'blog.security',
  jsonb_build_object(
    'csrf', '{"enabled":true,"exemptPaths":[]}'::jsonb,
    'cors', COALESCE("data"->'cors', '{"enabled":false,"origins":[]}'::jsonb)
  ),
  NOW(),
  NULL
FROM "setting"
WHERE "scope" = 'blog.cors'
  AND NOT EXISTS (SELECT 1 FROM "setting" WHERE "scope" = 'blog.security');

-- Step 3: Delete the retired cors row.
DELETE FROM "setting" WHERE "scope" = 'blog.cors';
