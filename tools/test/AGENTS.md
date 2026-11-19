# @kobato/test — shared test infrastructure

`@kobato/test` is deliberately PRODUCT-FREE: it holds generic Vitest infrastructure and imports no `@kobato/*` product package. Anything that models a product shape (settings bundle, DB lifecycle, oRPC caller, render helpers, lexical fixtures, i18n translators) lives in the consuming package's own `tests/utils/` and is imported through that package's test alias — `@kobato/<pkg>/tests/utils/...`, `@tests/utils/...` (app), `@kobato/web-tests/utils/...` / `@kobato/shared-tests/utils/...` (the umbrella roots). A package never imports another package's `tests/` tree.

This is what keeps the workspace dependency graph acyclic: `@kobato/test` has no product dependencies, so every package can devDepend on it without a cycle. Product-coupled fixtures must not move back here.

## Infrastructure requirements

Zero services. Integration suites run on a shared in-memory SQLite database per test file; file-backed backup/WAL flows and DuckDB sidecars use the package-local helpers (`@kobato/db/tests/utils/integration-db.ts`, `@kobato/db/tests/utils/analytics-db.ts`, `@kobato/server/tests/utils/integration-db.ts`). The `unit` and `snaps` projects skip the DB bootstrap entirely.

## Import surface

Import generic helpers as `@kobato/test/<name>.ts`:

- `deep-freeze` — recursive `Object.freeze` for fixtures that must stay mutation-proof across tests
- `dom-structure` — normalized DOM-tree diff for markup parity pins (a rendered React tree vs its hand-written HTML twin)
- `duckdb-files` — the exact list of test files that spin up the real DuckDB native engine (the dedicated `duckdb` project and the `unit`/`it` excludes share it)
- `env` — the test `process.env` contract
- `fake-broadcast-channel` — BroadcastChannel double
- `fetch` — fetch responder queue with call capture
- `in-memory-metric-reader` — explicit in-memory OpenTelemetry metric reader
- `log-message-literals` — the AST scanner behind the static-log-message guard
- `mock-react-query` — `mockTanstackQuery()`, the canonical `@tanstack/react-query` module mock
- `route-test-utils` — `asRoute()` component cast for route fixtures
- `rum-events` — RUM payload fixtures
- `setup/{unit,it,snaps}` — product-free project setups (see below)
- `silence-local-storage-warning` — drops Node's experimental `localStorage` getter warning
- `stubs/dialog` — SSR-safe dialog double: `vi.mock('@kobato/ui/components/dialog.tsx', () => import('@kobato/test/stubs/dialog.tsx'))`
- `virtual-modules` — the `virtual:route-warmup-script` Vite stub plugin
- `vitest.define` — `testDefine`, the compile-time `__APP_*__` constants read from `apps/kobato/package.json`

Out-of-process helpers do NOT live here — everything that drives a real kobato instance as a separate process lives in `@kobato/harness` (`tools/harness`). If a helper needs a socket, a child process, or a per-run temp dir, it belongs there.

## Product-coupled fixtures

Each consumer owns its copy under `tests/utils/` (the app uses `apps/kobato/tests/utils/`):

- `blog-settings`, `catalog`, `i18n`, `i18n-literals`, `i18n-render`, `hook`, `render`, `analytics-state` — product-shaped render/i18n/data fixtures
- `integration-db`, `analytics-db`, `db`, `memory-storage`, `mock-ctx`, `rpc-call`, `auth-context-mock`, `request-context`, `context`, `session`, `backup-buffer` — DB/server fixtures
- `lexical` — Lexical editor-state fixtures (`emptyLexicalBody`, `lexicalBodyWith`, `lexicalParagraph`, `lexicalHeading`, `lexicalImage`, `lexicalMusicPlayer`) + `stubMusicResolver` for `saveBody` inputs (server copy only)
- `comments-leaf` — provider factory for the three leaf-facing comments contexts

Do not create a cross-package import for these; copy the needed module into the consuming package's `tests/utils/`. `@kobato/inkling/tests/utils/` remains the editor island's own helper tree.

## Setup files

`setup/unit.ts`, `setup/it.ts`, and `setup/snaps.ts` are product-free. A project config points at a local wrapper under `<pkg>/tests/utils/setup/` which imports the generic base and then applies product state (test settings bundle, analytics executor reset, and — for the app/web umbrella only — the `useSettingsMutation` mock). Do not add product imports back to these base files.

`setup/unit.ts` imports `@date-fns/tz` up front so `TZDate` binds the real `Date` constructor before any test file calls `vi.useFakeTimers()` — a fake-Date-derived `TZDate` silently falls back to the system timezone and breaks `computeNextRun` whenever the system zone differs from the settings zone (CI runs TZ=UTC, the bundle pins Asia/Shanghai).

## Worker isolation

- **SQLite**: one in-memory database per test file. The package-local `integration-db` helper owns creation/teardown; `clearAllTables(db)` also resets `sqlite_sequence`, wipes the per-process filesystem cache and its L1 memory tier, and drops the generation memo.
- **File-backed flows**: the DB helper's `createTestDatabaseFile()` returns a fresh migrated temp file for backup/restore (VACUUM INTO, file swaps) and WAL/pragma assertions.
- **DuckDB**: the package-local `analytics-db` helper opens a per-run sidecar file; close it with `closeTestAnalyticsDb(handle)`. These files run in the dedicated `duckdb` project. Closing joins in-flight batcher flushes first; a `resetAllBatchers()` that precedes a handle close MUST be awaited. Both unit and integration setups reset the analytics query executor to `null` after each test.
- Tests that write tables should call `clearAllTables(db)` in `beforeEach` to reset state between cases within the same worker.
