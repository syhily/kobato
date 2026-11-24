# @kobato/test — shared test infrastructure

`@kobato/test` is deliberately PRODUCT-FREE: generic Vitest infrastructure only, importing no `@kobato/*` product
package. Anything that models a product shape (settings bundle, DB lifecycle, oRPC caller, render helpers, lexical
fixtures) lives in ONE canonical owner package's `tests/utils/`; other packages' test trees import it cross-package as
`@kobato/<owner>/tests/utils/<name>.ts` (the one sanctioned cross-package `tests/` edge, pinned by
`apps/kobato/tests/arch/package-dag.test.ts`). Canonical owners: `@kobato/settings/tests/utils/blog-settings.ts`,
`@kobato/i18n/tests/utils/i18n.ts`, `@kobato/api/tests/utils/catalog.ts`, `@kobato/inkling/tests/utils/lexical.ts`,
`@kobato/web-client/tests/utils/render.tsx`, `@kobato/ui/tests/utils/i18n-render.tsx` + `hook.tsx`,
`@kobato/web-admin/tests/utils/settings-mutation-mock.ts`, and
`@kobato/server/tests/utils/{session,capture-mail,smtp-capture,integration-db,analytics-db,request-context}.ts`.
Product-coupled fixtures must not move back here — this is what keeps the workspace graph acyclic.

## Import surface

Import generic helpers as `@kobato/test/<name>.ts`: `deep-freeze`, `dom-structure` (normalized DOM-tree diff), `env`,
`fake-broadcast-channel`, `fetch` (responder queue with call capture), `in-memory-metric-reader`, `repo-root` (the
single canonical `REPO_ROOT` anchor for workspace configs — import it instead of hand-counting `../` hops),
`vitest-base` (`vitestTestBase`, the workspace-wide pool/worker/isolation defaults every project spreads —
`isolate: true`, no exceptions), `log-message-literals` (the AST scanner behind the static-log-message guard),
`mock-react-query`, `route-test-utils`, `silence-local-storage-warning`, `virtual-modules`, `web-streams`
(`installWebStreamGlobals`, the vmThreads web-stream shim — fresh VM contexts do not inherit Node's web-stream globals),
`vitest.define` (`testDefine`, the compile-time `__APP_*__` constants).

There are no file-list scanners here and none may be added: project membership is expressed by include globs alone
(directory purpose + the `*.duckdb.test.ts` suffix), never by scanning test sources for markers.

## Project registry

`projects/registry.ts` exports `allTestProjects`, the explicit ordered table the root `vitest.config.ts` spreads into
`test.projects`. Factories: `projects/{shared-unit,shared-snaps,web-unit,web-snaps}.ts` (multi-leaf projects; includes
are leaf globs like `packages/shared/*/tests/unit/**`, so a new leaf joins automatically) and
`projects/{db-projects,server-projects,kobato-app-projects,ui-projects}.ts` (one multi-project owner per module,
including its `*-duckdb` project over `tests/it/**/*.duckdb.test.{ts,tsx}`). Single-project packages keep a
package-local `tests/**/vitest.config.ts` built on `vitestTestBase` — `packages/inkling` and `apps/inkling-demo` own the
React/SVGR Vite plugins through the `projects/{inkling-unit,demo-unit}.ts` plugin-taking factories, while
`packages/api`, `tools/pack`, and `tools/trace` consume the include constants from `projects/unit-includes.ts`; the
registry references all five configs by path. The registry is pinned by
`apps/kobato/tests/arch/vitest-project-registry.test.ts` (exact project set, every file matched exactly once, uniform
`isolate: true`, `e2e`/`browser` registered nowhere).

## Zero services

Integration suites run on a shared in-memory SQLite database per test file; file-backed backup/WAL flows and DuckDB
sidecars use the package-local helpers (`@kobato/db/tests/utils/{integration-db,analytics-db}.ts`,
`@kobato/server/tests/utils/integration-db.ts`). The `unit` and `snaps` projects skip the DB bootstrap entirely.

## Setup files

`setup/{node,dom,snaps}.ts` are product-free and layered: `node.ts` is the pure Node base (test env, `@date-fns/tz`
preloaded so `TZDate` binds the real `Date` constructor before any `vi.useFakeTimers()`, the DNS lookup mock, the
`node:dns/promises` + real-timer restore); `dom.ts` composes it with jest-dom, the `sonner` mock, and React `cleanup()`;
`snaps.ts` composes it with the `sonner` mock only — snapshot trees never mount React. Pure Node projects point at
`setup/node` (directly or through a product wrapper); DOM-rendering projects at `setup/dom` or `setup/snaps`. A project
config points at a product-state owner's wrapper under `<pkg>/tests/utils/setup/` that imports the base and applies
product state (vmThreads wrappers also call `web-streams`' `installWebStreamGlobals()` first); inkling's
`tests/setup.ts` wraps `setup/dom` with its jsdom DOM fallbacks. The base owns the `afterEach` real-timer restore —
wrappers reset product state only and never duplicate timer cleanup (pinned by
`apps/kobato/tests/arch/test-setup-conventions.test.ts`).

## Worker isolation

- Every project runs `isolate: true` (see `vitest-base`): each file gets a fresh module registry, so `vi.mock` holders,
  product global state, and native engines cannot leak across files — which is why no mock-file scan or shared/iso
  project split exists.
- **SQLite**: one in-memory database per file; the DB-owned `clearAllTables(db)` resets tables and `sqlite_sequence`
  only, while server integration helpers may also reset server caches.
- **File-backed flows**: `createTestDatabaseFile()` returns a fresh migrated temp file.
- **DuckDB**: per-run sidecar files in the `*-duckdb` projects; DB-owned handles close directly after their awaited
  writes, while server suites settle or reset batchers before closing adopted handles. Setups reset the analytics query
  executor to `null` after each test.
- Tests install fake timers in `beforeEach`, never at module scope; the setup base restores real timers after every
  test.
- Tests that write tables call `clearAllTables(db)` in `beforeEach`.
