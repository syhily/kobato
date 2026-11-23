# Database module conventions

`@kobato/db` owns SQLite content persistence and the DuckDB analytics sidecar: connections, schemas, row types, semantic
operations, migrations, and error classification. It depends on `@kobato/settings`, `@kobato/inkling` (headless), and
`@kobato/utils`; never on `@kobato/api`, `@kobato/server`, web, or UI packages.

- Import source modules directly as `@kobato/db/<path>.ts`; there is no barrel. Internal imports also use the package
  root.
- `src/sqlite/` and `src/duckdb/` are separate engine planes. `sqlite/database.ts` owns the shared `:memory:` sentinels,
  opaque `Database`/`DatabaseHandle` tokens, db-only `SqliteEngine`, and the only SQLite unwrap helpers; server code
  passes tokens without unwrapping them.
- `drizzle/{sqlite,duckdb}/` hold versioned migrations applied by db during engine initialization; server supplies only
  loggers and the generic SEA root.
- `duckdb/` owns the native engine, every DuckDB statement, and Drizzle query building/execution. `connection.ts` is the
  only token conversion seam; `database.ts` owns lifecycle; `migrate.ts` applies schema migrations; `schema.ts` owns
  Drizzle tables; `query.ts` owns the standalone builder and executor seam. Dashboard reads live in `duckdb/queries/`.
- DuckDB diagnostics use an injected `DuckDBLogger`. Wire DTOs, URL parsing, SSE caps, CSV serialization, lifecycle
  orchestration, and logging stay in their owning packages. Tests reset the analytics executor to `null`.
- `sqlite/schema/` contains persistence schema and canonical enum lists only. Domain validation and wire DTOs stay in
  `@kobato/api/contracts` or the owning server domain; value parity is pinned by server tests.
- `sqlite/operations/` owns every SQLite query and transaction behind semantic operations, grouped by `content/`,
  `taxonomy/`, `identity/`, `engagement/`, or `system/`; do not add flat modules. Server code never imports database
  drivers, constructs SQL, or accesses native clients. Split large modules by read/list/write/workflow responsibilities,
  not by table count, and never add re-export barrels. Domain orchestration, DTOs, cache/audit/logging, and transport
  errors stay in `@kobato/server`.
- `@kobato/server` never imports `@duckdb/node-api`, `@duckdbfan/drizzle-duckdb`, or `drizzle-orm`. It holds only opaque
  analytics handles/capabilities; `DuckDbEngine` and `engineOf` remain db-plane, including in server signatures.
