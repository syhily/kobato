# Database test conventions

- `tests/unit/` (`db-unit`) covers pure schema, query-builder, SQLite error, and DuckDB builder/appender-slot behavior
  without a real database engine.
- `tests/it/` (`db-it`) covers real Drizzle/SQLite operations and the DuckDB sidecar's non-engine tests through
  `@kobato/db` interfaces.
- Files that spin up the real DuckDB native engine live in `tests/it/` named `*.duckdb.test.ts`; the suffix routes them
  into the dedicated `db-duckdb` project (isolated, per-file timeouts) and out of `db-unit`/`db-it` — membership is by
  filename, never a manual list (pinned by `apps/kobato/tests/arch/duckdb-project-files.test.ts`).
- The three projects are defined in `@kobato/test/projects/db-projects.ts` and registered by the root
  `@kobato/test/projects/registry.ts`; all run `isolate: true`.
- Run with `pnpm test packages/db`.
- DB setup and database helpers live in `tests/utils/`; they import `@kobato/db` only — the harness owns its full
  lifecycle (open/migrate/close) and never touches `@kobato/server` composition, caches, or batchers. `getTestDb` keeps
  a migrated shared in-memory handle that the harness-level `afterAll` closes, so each file starts fresh;
  `createTestAnalyticsDb` handles are closed per handle, with a harness `afterAll` as the safety net. Generic
  infrastructure comes from `@kobato/test`; migration unit/integration tests live here with their implementation. Server
  composition adapters, batchers, and diagnostics stay in `@kobato/server`. DuckDB open/maintenance diagnostics log
  through an injected logger — db tests pass a local capture logger, not the server's global log capture.
