# @kobato/test — shared test infrastructure

`@kobato/test` is PRODUCT-FREE: generic Vitest infrastructure only, importing no `@kobato/*` product package. A helper
that models a product shape (settings bundle, DB lifecycle, oRPC caller, render helpers, lexical fixtures) lives in ONE
canonical owner package's `tests/utils/`, imported cross-package as `@kobato/<owner>/tests/utils/<name>.ts` — the one
sanctioned cross-package `tests/` edge (`apps/kobato/tests/arch/package-dag.test.ts`). Product-coupled fixtures must not
move back here. Canonical fixture owners: `@kobato/settings/tests/utils/blog-settings.ts`,
`@kobato/i18n/tests/utils/i18n.ts`, `@kobato/api/tests/utils/catalog.ts`, `@kobato/inkling/tests/utils/lexical.ts`,
`@kobato/web-client/tests/utils/render.tsx`, `@kobato/ui/tests/utils/{i18n-render,hook}.tsx`,
`@kobato/web-admin/tests/utils/settings-mutation-mock.ts`, and the server harnesses under `@kobato/server/tests/utils/`
(session, mail capture, integration DBs, request context).

## Import surface

Import generic helpers as `@kobato/test/<name>.ts` — every module in `src/` is a product-free double or fake; reach for
an existing one before writing a new one. Load-bearing modules: `repo-root` (the single `REPO_ROOT` anchor — never
hand-count `../` hops), `vitest-base` (`vitestTestBase`, the pool/worker/isolation defaults every project spreads;
`isolate: true`, no exceptions), `web-streams` (`installWebStreamGlobals`, the vmThreads web-stream shim), and
`vitest.define` (`testDefine`, the compile-time `__APP_*__` constants).

No file-list scanners here and none may be added: project membership is expressed by include globs alone (directory
purpose + the `*.duckdb.test.ts` suffix).

## Project registry

`projects/registry.ts` exports `allTestProjects`, the ordered table the root `vitest.config.ts` spreads into
`test.projects` (pinned by `apps/kobato/tests/arch/vitest-project-registry.test.ts`). Placement: multi-leaf projects
glob every leaf (`packages/shared/*/tests/unit/**` — a new leaf joins automatically); each module group has ONE
multi-project owner (which also owns its `*-duckdb` project); single-project packages keep a package-local
`tests/**/vitest.config.ts` on `vitestTestBase`, referenced by path.

## Zero services

Integration suites run on a shared in-memory SQLite database per test file; file-backed backup/WAL flows and DuckDB
sidecars use the owning package's helpers. The `unit` and `snaps` projects skip the DB bootstrap.

## Setup files

`setup/{node,dom,snaps}.ts` are product-free and layered — node base → DOM additions → snapshot-only (snapshot trees
never mount React). `node.ts` preloads `@date-fns/tz` so `TZDate` binds the real `Date` constructor before any
`vi.useFakeTimers()` — keep that ordering. Pure Node projects point at `setup/node`, DOM-rendering projects at
`setup/dom` or `setup/snaps`; a project config points at a product-state owner's wrapper under
`<pkg>/tests/utils/setup/` (vmThreads wrappers call `web-streams`' `installWebStreamGlobals()` first). The base owns the
`afterEach` real-timer restore — wrappers reset product state only and never duplicate timer cleanup
(`apps/kobato/tests/arch/test-setup-conventions.test.ts`).

## Worker isolation

- Pool defaults from `vitestTestBase`: `pool: 'threads'`, `maxWorkers: 4` (`--maxWorkers=<n>` for more cores); DOM-heavy
  trees override `pool: 'vmThreads'` (`web-unit`, `web-snaps`, `ui-unit`, `demo-unit`, `inkling-unit`), and
  `web-tz-unit` runs forks for its runtime `process.env.TZ` write.
- `isolate: true` everywhere: each file gets a fresh module registry, so `vi.mock` holders, product global state, and
  native engines cannot leak across files.
- SQLite: one in-memory database per file; `clearAllTables(db)` resets tables and `sqlite_sequence` (server helpers may
  also reset server caches). File-backed flows: `createTestDatabaseFile()` returns a fresh migrated temp file.
- DuckDB: per-run sidecar files in the `*-duckdb` projects; DB-owned handles close directly after their awaited writes,
  server suites settle or reset batchers first.
- Fake timers go in `beforeEach`, never at module scope. Tests that write tables call `clearAllTables(db)` in
  `beforeEach`.
