# @kobato/test — shared test infrastructure

`@kobato/test` is deliberately PRODUCT-FREE: generic Vitest infrastructure only, importing no `@kobato/*` product package. Anything that models a product shape (settings bundle, DB lifecycle, oRPC caller, render helpers, lexical fixtures) lives in ONE canonical owner package's `tests/utils/`; other packages' test trees import it cross-package as `@kobato/<owner>/tests/utils/<name>.ts` (the one sanctioned cross-package `tests/` edge, pinned by `apps/kobato/tests/arch/package-dag.test.ts`). Canonical owners: `@kobato/settings/tests/utils/blog-settings.ts`, `@kobato/i18n/tests/utils/i18n.ts`, `@kobato/contracts/tests/utils/catalog.ts`, `@kobato/inkling/tests/utils/lexical.ts`, `@kobato/web-client/tests/utils/render.tsx`, `@kobato/ui/tests/utils/i18n-render.tsx` + `hook.tsx`, `@kobato/web-admin/tests/utils/settings-mutation-mock.ts`, and `@kobato/server/tests/utils/{session,capture-mail,integration-db,analytics-db,request-context}.ts`. Product-coupled fixtures must not move back here — this is what keeps the workspace graph acyclic.

## Import surface

Import generic helpers as `@kobato/test/<name>.ts`: `deep-freeze`, `dom-structure` (normalized DOM-tree diff), `duckdb-files` (the exact list of files that spin up the real DuckDB engine), `env`, `fake-broadcast-channel`, `fetch` (responder queue with call capture), `in-memory-metric-reader`, `mock-files` (scans test files for module-level `vi.mock(`/`vi.doMock(` — mock holders poison the shared module registry under `isolate: false`, so the iso projects include exactly the scanned list), `vitest-base` (`vitestTestBase`, the workspace-wide pool/isolate defaults every project config spreads), `log-message-literals` (the AST scanner behind the static-log-message guard), `mock-react-query`, `route-test-utils`, `silence-local-storage-warning`, `virtual-modules`, `web-streams` (`installWebStreamGlobals`, the vmThreads web-stream shim — fresh VM contexts do not inherit Node's web-stream globals), `setup/{unit,it,snaps}` (product-free project setups), `vitest.define` (`testDefine`, the compile-time `__APP_*__` constants). `projects/{shared-unit,shared-snaps,web-unit,web-snaps}.ts` owns the multi-package Vitest projects; their includes are leaf globs (`packages/shared/*/tests/...`, `packages/web/*/tests/...`), so a new leaf's tests join its project automatically. There are no non-package `packages/{shared,web}/tests/` coordination trees.

Out-of-process helpers do NOT live here — everything that drives a real kobato instance as a separate process lives in `@kobato/harness`.

## Zero services

Integration suites run on a shared in-memory SQLite database per test file; file-backed backup/WAL flows and DuckDB sidecars use the package-local helpers (`@kobato/db/tests/utils/{integration-db,analytics-db}.ts`, `@kobato/server/tests/utils/integration-db.ts`). The `unit` and `snaps` projects skip the DB bootstrap entirely.

## Setup files

`setup/{unit,it,snaps}.ts` are product-free; a project config points at a product-state owner's wrapper under `<pkg>/tests/utils/setup/` that imports the base and applies product state (vmThreads wrappers also call `web-streams`' `installWebStreamGlobals()` first). The shared projects use `@kobato/settings`' wrappers; web projects use `@kobato/web-admin`'s wrappers for the admin-wide mutation mock; inkling's `tests/setup.ts` wraps the base with its jsdom DOM fallbacks. `setup/unit.ts` imports `@date-fns/tz` up front so `TZDate` binds the real `Date` constructor before any `vi.useFakeTimers()` (a fake-Date-derived `TZDate` silently falls back to the system timezone).

## Worker isolation

- **SQLite**: one in-memory database per file; the DB-owned `clearAllTables(db)` resets tables and `sqlite_sequence` only, while server integration helpers may also reset server caches.
- **File-backed flows**: `createTestDatabaseFile()` returns a fresh migrated temp file.
- **DuckDB**: per-run sidecar files in the `duckdb` project; DB-owned handles close directly after their awaited writes, while server suites settle or reset batchers before closing adopted handles. Setups reset the analytics query executor to `null` after each test.
- The base setups restore real timers after every test, preventing one file from freezing a later file in the same worker. Tests install fake timers in `beforeEach`, never at module scope.
- Tests that write tables call `clearAllTables(db)` in `beforeEach`.
