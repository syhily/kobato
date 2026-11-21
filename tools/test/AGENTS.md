# @kobato/test — shared test infrastructure

`@kobato/test` is deliberately PRODUCT-FREE: generic Vitest infrastructure only, importing no `@kobato/*` product package. Anything that models a product shape (settings bundle, DB lifecycle, oRPC caller, render helpers, lexical fixtures) lives in the consuming package's `tests/utils/`. A package never imports another package's `tests/` tree. Product-coupled fixtures must not move back here — this is what keeps the workspace graph acyclic.

## Import surface

Import generic helpers as `@kobato/test/<name>.ts`: `deep-freeze`, `dom-structure` (normalized DOM-tree diff), `duckdb-files` (the exact list of files that spin up the real DuckDB engine), `env`, `fake-broadcast-channel`, `fetch` (responder queue with call capture), `in-memory-metric-reader`, `mock-files` (scans test files for module-level `vi.mock(`/`vi.doMock(` — mock holders poison the shared module registry under `isolate: false`, so the iso projects include exactly the scanned list), `vitest-base` (`vitestTestBase`, the workspace-wide pool/isolate defaults every project config spreads), `log-message-literals` (the AST scanner behind the static-log-message guard), `mock-react-query`, `route-test-utils`, `rum-events`, `silence-local-storage-warning`, `stubs/dialog`, `virtual-modules`, `setup/{unit,it,snaps}` (product-free project setups), `vitest.define` (`testDefine`, the compile-time `__APP_*__` constants).

Out-of-process helpers do NOT live here — everything that drives a real kobato instance as a separate process lives in `@kobato/harness`.

## Zero services

Integration suites run on a shared in-memory SQLite database per test file; file-backed backup/WAL flows and DuckDB sidecars use the package-local helpers (`@kobato/db/tests/utils/{integration-db,analytics-db}.ts`, `@kobato/server/tests/utils/integration-db.ts`). The `unit` and `snaps` projects skip the DB bootstrap entirely.

## Setup files

`setup/{unit,it,snaps}.ts` are product-free; a project config points at a local wrapper under `<pkg>/tests/utils/setup/` that imports the base and applies product state. `setup/unit.ts` imports `@date-fns/tz` up front so `TZDate` binds the real `Date` constructor before any `vi.useFakeTimers()` (a fake-Date-derived `TZDate` silently falls back to the system timezone).

## Worker isolation

- **SQLite**: one in-memory database per file; `clearAllTables(db)` also resets `sqlite_sequence`, wipes the filesystem cache + L1, drops the generation memo.
- **File-backed flows**: `createTestDatabaseFile()` returns a fresh migrated temp file.
- **DuckDB**: per-run sidecar files in the `duckdb` project; close with `closeTestAnalyticsDb(handle)` — a preceding `resetAllBatchers()` MUST be awaited; setups reset the analytics query executor to `null` after each test.
- The base setups end every file with `vi.useRealTimers()` (fake timers left installed would freeze later files in the same worker). Shared-project files install fake timers in `beforeEach`, never at module scope.
- Tests that write tables call `clearAllTables(db)` in `beforeEach`.
