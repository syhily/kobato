# Drizzle migration conventions

SQLite migrations for the content database. Layout (drizzle-kit 1.0 rc): one `<timestamp>_<name>/` folder per
migration holding `migration.sql` + `snapshot.json`; there is NO `meta/_journal.json`. The runtime migrator
(`@kobato/db/sqlite/migrate.ts`) applies every folder's `migration.sql` in folder-name order and records it in
`__drizzle_migrations`; `snapshot.json` is drizzle-kit's diff input only (the SEA build excludes it).

- Generate with `pnpm run db:gen`; never hand-write a new migration folder.
- Rename the generated folder to a semantic name before committing (`20261112030405_snapshot` →
  `20261112030405_add_oauth_accounts`), keeping the `<timestamp>_` prefix — folder-name order is the apply order.
  Rename before any database has applied it: the migrator records the folder name, so renaming an applied folder
  re-runs its SQL.
- New migrations must be defensive: every `CREATE TABLE` / `CREATE INDEX` / `CREATE UNIQUE INDEX` carries `IF NOT
  EXISTS` so an already-final-schema database applies the folder no-op.
- **Keep only the LATEST `snapshot.json`** — delete older folders' snapshots after generating (`migration.sql` stays);
  drizzle-kit diffs against the single leaf snapshot.
- Never edit a committed `migration.sql` in place except to add `IF NOT EXISTS` — the migrator skips applied folders,
  so an in-place edit forks the schema between environments.
