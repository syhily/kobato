# @kobato/test — shared test infrastructure

`@kobato/test` is PRODUCT-FREE: generic Vitest infrastructure only, importing no `@kobato/*` product package. A helper
that models a product shape (settings bundle, DB lifecycle, oRPC caller, render helpers, lexical fixtures) lives in ONE
canonical owner package's `tests/utils/`, imported cross-package as `@kobato/<owner>/tests/utils/<name>.ts` — the one
sanctioned cross-package `tests/` edge (`apps/kobato/tests/arch/package-dag.test.ts`). Canonical owners:
`@kobato/settings/tests/utils/blog-settings.ts`, `@kobato/i18n/tests/utils/i18n.ts`,
`@kobato/api/tests/utils/catalog.ts`, `@kobato/inkling/tests/utils/lexical.ts`,
`@kobato/web-client/tests/utils/render.tsx`, `@kobato/ui/tests/utils/{i18n-render,hook}.tsx`,
`@kobato/web-admin/tests/utils/settings-mutation-mock.ts`, and
`@kobato/server/tests/utils/{session,capture-mail,smtp-capture,integration-db,analytics-db,request-context}.ts`.
Product-coupled fixtures must not move back here.

## Import surface

Import generic helpers as `@kobato/test/<name>.ts`: `deep-freeze`, `dom-structure`, `env`, `fake-broadcast-channel`,
`fetch` (responder queue with call capture), `in-memory-metric-reader`, `repo-root` (the single `REPO_ROOT` anchor —
never hand-count `../` hops), `vitest-base` (`vitestTestBase`, the pool/worker/isolation defaults every project spreads;
`isolate: true`, no exceptions), `log-message-literals` (the AST scanner behind the static-log-message guard),
`mock-react-query`, `route-test-utils`, `silence-local-storage-warning`, `virtual-modules`, `web-streams`
(`installWebStreamGlobals`, the vmThreads web-stream shim), `vitest.define` (`testDefine`, the compile-time `__APP_*__`
constants).

No file-list scanners here and none may be added: project membership is expressed by include globs alone (directory
purpose + the `*.duckdb.test.ts` suffix).

## Project registry

`projects/registry.ts` exports `allTestProjects`, the ordered table the root `vitest.config.ts` spreads into
`test.projects` (pinned by `apps/kobato/tests/arch/vitest-project-registry.test.ts`). Multi-leaf projects:
`projects/{shared-unit,shared-snaps,web-unit,web-snaps}.ts` (leaf globs like `packages/shared/*/tests/unit/**`, so a new
leaf joins automatically). One multi-project owner per module:
`projects/{db-projects,server-projects, kobato-app-projects,ui-projects}.ts`, each including its `*-duckdb` project.
Single-project packages keep a package-local `tests/**/vitest.config.ts` on `vitestTestBase`: `packages/inkling` and
`apps/inkling-demo` through the plugin-taking `projects/{inkling-unit,demo-unit}.ts`; `packages/api`, `tools/pack`, and
`tools/trace` consume the include constants from `projects/unit-includes.ts`. All five configs are referenced by path.

## Zero services

Integration suites run on a shared in-memory SQLite database per test file; file-backed backup/WAL flows and DuckDB
sidecars use the package-local helpers (`@kobato/db/tests/utils/{integration-db,analytics-db}.ts`,
`@kobato/server/tests/utils/integration-db.ts`). The `unit` and `snaps` projects skip the DB bootstrap.

## Setup files

`setup/{node,dom,snaps}.ts` are product-free and layered: `node.ts` is the pure Node base (test env, `@date-fns/tz`
preloaded so `TZDate` binds the real `Date` constructor before any `vi.useFakeTimers()`, the DNS lookup mock, the
`node:dns/promises` + real-timer restore); `dom.ts` adds jest-dom, the `sonner` mock, and React `cleanup()`; `snaps.ts`
adds the `sonner` mock only — snapshot trees never mount React. Pure Node projects point at `setup/node` (directly or
through a product wrapper); DOM-rendering projects at `setup/dom` or `setup/snaps`. A project config points at a
product-state owner's wrapper under `<pkg>/tests/utils/setup/` (vmThreads wrappers call `web-streams`'
`installWebStreamGlobals()` first). The base owns the `afterEach` real-timer restore — wrappers reset product state only
and never duplicate timer cleanup (`apps/kobato/tests/arch/test-setup-conventions.test.ts`).

## Worker isolation

- `isolate: true` everywhere: each file gets a fresh module registry, so `vi.mock` holders, product global state, and
  native engines cannot leak across files.
- SQLite: one in-memory database per file; `clearAllTables(db)` resets tables and `sqlite_sequence` (server helpers may
  also reset server caches). File-backed flows: `createTestDatabaseFile()` returns a fresh migrated temp file.
- DuckDB: per-run sidecar files in the `*-duckdb` projects; DB-owned handles close directly after their awaited writes,
  server suites settle or reset batchers first. Setups reset the analytics query executor to `null` after each test.
- Fake timers go in `beforeEach`, never at module scope. Tests that write tables call `clearAllTables(db)` in
  `beforeEach`.
