# Database module conventions

`@kobato/db` owns the content database's SQLite/Drizzle implementation AND the DuckDB analytics sidecar's persistence
layer: connection primitives, schema, row types, query operations, migrations, SQLite error classification, and the
DuckDB DDL/appender/query modules. It depends on `@kobato/settings`, `@kobato/inkling` (headless — the comment document
schema), `@kobato/utils`, never on `@kobato/api` (the wire), `@kobato/server`, `@kobato/web-admin`, or `@kobato/ui`.

- Callers import source modules directly as `@kobato/db/<path>.ts`; there is no barrel. Imports within this package also
  use the package root.
- Engine planes: `src/` root, `schema/`, and `operations/` are the SQLite/Drizzle plane; `duckdb/` is the analytics
  plane. A module belongs to exactly one plane, with `database.ts` (the shared `:memory:` path sentinels) the only
  crossing. `database.ts` also owns the opaque `Database`/`DatabaseHandle` tokens (no native client or Drizzle query
  surface), the db-only `SqliteEngine` anatomy, and the single `sqliteOf`/`sqliteEngineOf`/`databaseOf` conversion seam;
  server code passes tokens but never imports the unwrap helpers.
- `drizzle/` contains the package-owned SQL migrations and the latest drizzle-kit snapshot; `src/migrate.ts` resolves
  this directory through the package export outside SEA. See `drizzle/AGENTS.md`. `drizzle.config.ts` lives at the
  package root; `pnpm run db:gen` / `db:migrate` forward here.
- `duckdb/` owns the analytics sidecar's persistence — the native engine, every DuckDB statement, and the Kysely builder
  never leave this plane: `connection.ts` (the single conversion module: the opaque `AnalyticsHandle` — branded,
  lifecycle metadata `path`/`inMemory`/`closed` only, no connection fields — the db-plane `DuckDbEngine` anatomy behind
  it, the opaque `AnalyticsWriter`/`AnalyticsReader`/`AnalyticsQuery` capabilities, and the only sanctioned
  brand/unbrand helpers incl. `engineOf`), `database.ts` (engine lifecycle over the opaque handle — open/close,
  `checkpointAnalyticsDatabase`, the 2.0 storage-format upgrade), `schema.ts` (the complete
  `ANALYTICS_DDL`/`ANALYTICS_TABLES` list), `access-events.ts` (DDL, the `blobsMap` slot contracts, the
  `EnrichedAccessEvent` row type, chunk-based appends), `device-env.ts` (both sidecars + dedup probes), `maintenance.ts`
  (retention DELETE + CHECKPOINT), `blob-migration.ts` (legacy `access_log` one-shot), `self-check.ts` (the tiny
  native-engine aggregate probe the SEA `--smoke-natives` leg calls), and `query.ts` (Kysely as a compile-only SQL
  builder — DummyDriver, identifier whitelist, bound parameters only — plus the `setAnalyticsQueryExecutor` telemetry
  seam). Dashboard read queries live in `duckdb/queries/`. DuckDB diagnostics log through an INJECTED `DuckDBLogger` —
  this package never reaches for a logger or imports server trace. Wire twins live in `@kobato/api/contracts/analytics`;
  URL parsing, SSE caps, CSV serialization, overview fan-out, and every lifecycle concern stay in `@kobato/server`. Test
  setups reset the executor to `null` after each test.
- `schema/` contains only persistence schema, including the persistence-canonical enum lists that generate the drizzle
  `text({ enum })` columns and SQL CHECK literals. Domain validation and wire DTOs stay in `@kobato/api/contracts` or
  the owning server domain — every duplicated list is pinned value-identical by
  `packages/server/tests/unit/server/infra/db/wire-parity.test.ts`.
- `operations/` owns EVERY SQLite query and transaction script behind semantic operations with local row/criteria types
  (including `maintenance.ts`'s `vacuumDatabaseInto` / `analyzeDatabase` / `runSqlitePragmaMaintenance`). Server code
  never imports `node:sqlite` or Drizzle, constructs SQL/`SQL` conditions, or accesses native clients; it passes opaque
  tokens to these operations. Domain orchestration, wire DTOs, cache/audit/logging, and transport errors stay in
  `@kobato/server`; `db` never imports server or api. Raw query/transaction helpers exported for white-box tests are
  db-plane only and are not a server interface.
- `migrate.ts` owns migration execution; the server composition root only injects its `MigrationLogger` and optional SEA
  folder. Process lifecycle, batchers, schedulers, path selection, and observability remain in `@kobato/server`.
- DuckDB ownership boundary: `@kobato/server` never imports `@duckdb/node-api` or `kysely`, never executes DuckDB SQL,
  and never sees a native connection field. Server code holds the opaque `AnalyticsHandle` engine token (lifecycle
  metadata only) plus the `AnalyticsWriter`/`AnalyticsReader`/`AnalyticsQuery` capabilities and passes them into the
  operations above; the `DuckDbEngine` anatomy and `engineOf` are db-plane (tests included) and never appear in a server
  signature.
