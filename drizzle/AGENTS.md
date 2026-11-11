# Drizzle migration conventions

SQLite migrations for the content database. Layout (drizzle-kit 1.0 rc): one `<timestamp>_<name>/`
folder per migration holding `migration.sql` + `snapshot.json`; there is NO `meta/_journal.json`.
The runtime migrator (`src/server/infra/db/migrate.ts`) applies every folder's `migration.sql` in
folder-name order and records it in `__drizzle_migrations`; `snapshot.json` is drizzle-kit's diff
input only and is never read at runtime (the SEA build even excludes it — `scripts/sea/assets.ts`).

## Rules

- Generate with `pnpm run db:gen`; never hand-write a new migration folder from scratch.
- Rename the newly generated folder to a semantic name that matches the business change before
  committing (e.g. `20261112030405_snapshot` → `20261112030405_add_oauth_accounts`). Keep the
  `<timestamp>_` prefix — folder-name order is the apply order — and only replace the auto-generated
  suffix. Rename before any database has applied the migration: the migrator records the folder
  name in `__drizzle_migrations`, so renaming an already-applied folder would re-run its SQL.
- New migrations must be defensive: every `CREATE TABLE` / `CREATE INDEX` / `CREATE UNIQUE INDEX`
  statement carries `IF NOT EXISTS`, so a database that already has the final schema (migrations
  table wiped, backup restored) can apply the folder no-op. Rewrite the generated SQL before
  committing (`CREATE TABLE \`` → `CREATE TABLE IF NOT EXISTS \``, same for both index forms).
- **Keep only the LATEST `snapshot.json`.** After generating a new migration, delete the
  `snapshot.json` of every older migration folder (the folders' `migration.sql` stays — the
  runtime still needs it). drizzle-kit diffs against the single leaf snapshot, so older snapshots
  are dead weight and must not accumulate.
- Never edit an already-committed `migration.sql` in place except to add `IF NOT EXISTS`: the
  migrator skips folders already recorded in `__drizzle_migrations`, so an in-place edit never
  reaches applied databases and silently forks the schema between environments.
