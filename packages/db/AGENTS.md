# Database module conventions

`@kobato/db` owns the content database's SQLite/Drizzle implementation AND the DuckDB analytics sidecar's persistence
layer: connection primitives, schema, row types, query operations, migrations, SQLite error classification, and the
DuckDB DDL/appender/query modules. It depends on `@kobato/settings`, `@kobato/inkling` (headless — the comment document
schema), `@kobato/utils`, never on `@kobato/api` (the wire), `@kobato/server`, `@kobato/web-admin`, or `@kobato/ui`.

- Callers import source modules directly as `@kobato/db/<path>.ts`; there is no barrel. Imports within this package also
  use the package root.
- Engine planes: `src/` root, `schema/`, and `operations/` are the SQLite/Drizzle plane; `duckdb/` is the analytics
  plane. A module belongs to exactly one plane, with `database.ts` (the shared `:memory:` path sentinels) the only
  crossing.
- `drizzle/` contains the package-owned SQL migrations and the latest drizzle-kit snapshot; `src/migrate.ts` resolves
  this directory through the package export outside SEA. See `drizzle/AGENTS.md`. `drizzle.config.ts` lives at the
  package root; `pnpm run db:gen` / `db:migrate` forward here.
- `duckdb/` owns the analytics sidecar's persistence: `database.ts` (engine handle — open/close, reader/writer
  connections, the 2.0 storage-format upgrade), `schema.ts` (the complete `ANALYTICS_DDL`/`ANALYTICS_TABLES` list),
  `access-events.ts` (DDL, the `blobsMap` slot contracts, the `EnrichedAccessEvent` row type, chunk-based appends),
  `device-env.ts` (both sidecars + dedup probes), `maintenance.ts` (retention DELETE + CHECKPOINT), `blob-migration.ts`
  (legacy `access_log` one-shot), and `query.ts` (Kysely as a compile-only SQL builder — DummyDriver, identifier
  whitelist, bound parameters only — plus the `setAnalyticsQueryExecutor` telemetry seam). Dashboard read queries live
  in `duckdb/queries/`. DuckDB diagnostics log through an INJECTED `DuckDBLogger` — this package never reaches for a
  logger or imports server trace. Wire twins live in `@kobato/api/contracts/analytics`; URL parsing, SSE caps, CSV
  serialization, overview fan-out, and every lifecycle concern stay in `@kobato/server`. Test setups reset the executor
  to `null` after each test.
- `schema/` contains only persistence schema, including the persistence-canonical enum lists that generate the drizzle
  `text({ enum })` columns and SQL CHECK literals. Domain validation and wire DTOs stay in `@kobato/api/contracts` or
  the owning server domain — every duplicated list is pinned value-identical by
  `packages/server/tests/unit/server/infra/db/wire-parity.test.ts`.
- `operations/` contains reusable Drizzle queries and engine operations (including `maintenance.ts`'s
  `vacuumDatabaseInto` / `analyzeDatabase`). Domain orchestration and transport errors stay in `@kobato/server`.
- `migrate.ts` owns migration execution; the server composition root only injects its `MigrationLogger` and optional SEA
  folder. Process lifecycle, batchers, schedulers, path selection, and observability remain in `@kobato/server`.
