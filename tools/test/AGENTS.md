# @kobato/test — shared test infrastructure

`@kobato/test` is deliberately PRODUCT-FREE: it holds generic Vitest infrastructure and imports no `@kobato/*` product package. Anything that models a product shape (settings bundle, DB lifecycle, oRPC caller, render helpers, lexical fixtures, i18n translators) lives in the consuming package's own `tests/utils/`, imported through that package's test alias. A package never imports another package's `tests/` tree. This is what keeps the workspace graph acyclic: every package can devDepend on `@kobato/test` without a cycle. Product-coupled fixtures must not move back here.

## Infrastructure requirements

Zero services. Integration suites run on a shared in-memory SQLite database per test file; file-backed backup/WAL flows and DuckDB sidecars use the package-local helpers (`@kobato/db/tests/utils/{integration-db,analytics-db}.ts`, `@kobato/server/tests/utils/integration-db.ts`). The `unit` and `snaps` projects skip the DB bootstrap entirely.

## Import surface

Import generic helpers as `@kobato/test/<name>.ts`:

- `deep-freeze` — recursive `Object.freeze` for mutation-proof fixtures
- `dom-structure` — normalized DOM-tree diff for markup parity pins
- `duckdb-files` — the exact list of test files that spin up the real DuckDB native engine (the `duckdb` project and the `unit`/`it` excludes share it)
- `env` — the test `process.env` contract
- `fake-broadcast-channel`, `fetch` (responder queue with call capture), `in-memory-metric-reader`
- `vitest-base` — `vitestTestBase`, the workspace-wide pool/isolate/maxWorkers defaults every project config spreads into its `test` block (file-based projects do not inherit the root config's test options)
- `log-message-literals` — the AST scanner behind the static-log-message guard
- `mock-react-query` — the canonical `@tanstack/react-query` module mock
- `route-test-utils`, `rum-events`, `silence-local-storage-warning`
- `stubs/dialog` — SSR-safe dialog double (`vi.mock('@kobato/ui/components/dialog.tsx', …)`)
- `virtual-modules` — the `virtual:route-warmup-script` Vite stub plugin
- `setup/{unit,it,snaps}` — product-free project setups
- `vitest.define` — `testDefine`, the compile-time `__APP_*__` constants

Out-of-process helpers do NOT live here — everything that drives a real kobato instance as a separate process lives in `@kobato/harness`.

## Product-coupled fixtures

Each consumer owns its copy under `tests/utils/` (render/i18n/data fixtures, DB/server fixtures, the `lexical` editor-state fixtures, `comments-leaf`). Do not create a cross-package import for these; copy the needed module into the consuming package's `tests/utils/`. `@kobato/inkling/tests/utils/` remains the editor island's own helper tree.

## Setup files

`setup/unit.ts`, `setup/it.ts`, `setup/snaps.ts` are product-free. A project config points at a local wrapper under `<pkg>/tests/utils/setup/` which imports the generic base and then applies product state. Do not add product imports back to these base files.

`setup/unit.ts` imports `@date-fns/tz` up front so `TZDate` binds the real `Date` constructor before any `vi.useFakeTimers()` — a fake-Date-derived `TZDate` silently falls back to the system timezone (CI runs TZ=UTC, the bundle pins Asia/Shanghai).

## Worker isolation

- **SQLite**: one in-memory database per test file; `clearAllTables(db)` also resets `sqlite_sequence`, wipes the filesystem cache and its L1 tier, and drops the generation memo.
- **File-backed flows**: `createTestDatabaseFile()` returns a fresh migrated temp file for backup/restore and WAL/pragma assertions.
- **DuckDB**: per-run sidecar files in the dedicated `duckdb` project; close with `closeTestAnalyticsDb(handle)` — a `resetAllBatchers()` that precedes a handle close MUST be awaited. Both setups reset the analytics query executor to `null` after each test.
- Tests that write tables call `clearAllTables(db)` in `beforeEach`.
