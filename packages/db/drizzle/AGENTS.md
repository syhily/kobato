# Drizzle migration conventions

`sqlite/` and `duckdb/` hold ordered, immutable migrations. Keep only the latest `snapshot.json`; SEA packages SQL under
`drizzle/` and excludes snapshots.

- Generate both engines with `pnpm run db:gen`; audit DuckDB SQL generated through the PostgreSQL dialect.
- Applied folders and SQL never change. Baselines use `IF NOT EXISTS` so existing unjournaled databases adopt them safely.
- Db migrators own paths and journals; server supplies only the generic SEA root. Conditional legacy data copies remain
  separate db data migrations.
