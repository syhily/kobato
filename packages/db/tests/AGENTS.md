# Database test conventions

- `tests/unit/` (`db-unit`) covers pure schema, query-builder, SQLite error, and DuckDB builder/appender-slot behavior without a real database engine (the real-engine files run in the dedicated `duckdb` project instead — see `apps/kobato/tests/AGENTS.md`).
- `tests/it/` (`db-it`) covers real Drizzle/SQLite operations and the DuckDB sidecar's non-engine tests through `@kobato/db` interfaces.
- Files that spin up the real DuckDB native engine (`tests/{it,unit}/duckdb/…`) are listed in `@kobato/test/duckdb-files.ts` and run ONLY in the dedicated `duckdb` project (serial forks); the `db-unit`/`db-it` excludes pin the same list.
- Run with `npx vitest run --project db-unit` / `--project db-it`.
- DB setup and database helpers live in `tests/utils/` (copied from the former shared harness); generic infrastructure comes from `@kobato/test`; migration unit/integration tests live here with their implementation. Server composition adapters, batchers, and diagnostics stay in `@kobato/server`. DuckDB open/maintenance diagnostics log through an injected logger — db tests pass a local capture logger, not the server's global log capture.
