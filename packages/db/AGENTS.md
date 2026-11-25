# Database module conventions

`@kobato/db` owns SQLite content persistence and the DuckDB analytics sidecar: connections, schemas, row types, semantic
operations, migrations, and error classification. It depends on `@kobato/settings`, `@kobato/inkling` (headless), and
`@kobato/utils`; never on `@kobato/api`, `@kobato/server`, web, or UI packages.

- Import source modules directly as `@kobato/db/<path>.ts` (internal imports too); there is no barrel.
- `src/sqlite/` and `src/duckdb/` are separate engine planes. `sqlite/database.ts` owns the shared `:memory:` sentinels,
  the opaque `Database`/`DatabaseHandle` tokens, the db-only `SqliteEngine`, and the only SQLite unwrap helpers.
- `drizzle/{sqlite,duckdb}/` hold versioned migrations applied by db during engine initialization; server supplies only
  loggers and the generic SEA root.
- `duckdb/` owns the native engine, every DuckDB statement, and Drizzle query building/execution: `connection.ts` is the
  only token conversion seam, `database.ts` the lifecycle, `migrate.ts` the schema migrations, `schema.ts` the Drizzle
  tables, `query.ts` the standalone builder and executor seam; dashboard reads live in `duckdb/queries/`. Diagnostics go
  through an injected `DuckDBLogger`.
- `sqlite/schema/` contains persistence schema and canonical enum lists only; domain validation and wire DTOs stay in
  `@kobato/api/contracts` or the owning server domain (value parity is pinned by server tests).
- `sqlite/operations/` owns every SQLite query and transaction behind semantic operations, grouped by `content/`,
  `taxonomy/`, `identity/`, `engagement/`, or `system/` — no flat modules. Split large modules by read/list/write/
  workflow responsibilities, not by table count; never add re-export barrels. Domain orchestration, DTOs,
  cache/audit/logging, and transport errors stay in `@kobato/server`.
- `@kobato/server` never imports `@duckdb/node-api`, `@duckdbfan/drizzle-duckdb`, or `drizzle-orm` and never constructs
  SQL or touches native clients: it holds only opaque analytics handles/capabilities. `DuckDbEngine` and `engineOf`
  remain db-plane, including in server signatures.
- Upgrades move `drizzle-orm` / `drizzle-kit` together and re-run the migration contract tests. Raw integer `sql` fields
  in mapped selects need an explicit `.mapWith(Number)` — rc.6 decodes them as `bigint` on `node:sqlite`.
  `@duckdbfan/drizzle-duckdb`'s DuckDB 2.0 peer exception requires the real DuckDB suites on upgrades.
