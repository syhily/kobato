# @kobato/test — everything an in-process test needs

`@kobato/test` is the Vitest infrastructure of the workspace: fixtures and doubles, the shared setups, the Vitest
project table (`src/projects/`), `deep-freeze`, `repo-root`, `vitest.base.ts`, `vitest.define.ts` and their like. It is
PRODUCT-FREE — it imports no `@kobato/*` product package and declares none (`apps/kobato/tests/arch/package-dag.test.ts`
pins every src file), so every product package and every shared leaf may depend on it for its tests without ever forming
a workspace cycle. Everything that runs out of process — the live-instance driver, the process primitives, the
Playwright journey support — lives in `@kobato/instance` (`tools/instance/AGENTS.md`), which depends on this package for
`repo-root` and the Vitest base and is never imported by it. Nothing here imports `@kobato/pack` or `@kobato/instance`:
`pack` → `instance` → `test` is the only direction between the three tooling packages.

A helper that models a product shape (settings bundle, DB lifecycle, oRPC caller, render helpers, lexical fixtures)
lives in ONE canonical owner package's `tests/utils/`, imported cross-package as `@kobato/<owner>/tests/utils/<name>.ts`
— the one sanctioned cross-package `tests/` edge (`apps/kobato/tests/arch/package-dag.test.ts`). Product-coupled
fixtures must not move back here. Canonical fixture owners: `@kobato/settings/tests/utils/blog-settings.ts`,
`@kobato/i18n/tests/utils/i18n.ts`, `@kobato/api/tests/utils/{catalog,notifications}.ts`,
`@kobato/inkling/tests/utils/lexical.ts`, `@kobato/web-kit/tests/utils/render.tsx`,
`@kobato/ui/tests/utils/{i18n-render,hook}.tsx`, `@kobato/ui/tests/utils/document-facts.ts` (the `DocumentFacts`
fixture, mounted only by the kit's canonical render helper above — the `@kobato/ui` render helpers mount none, and tests
mount `DocumentFactsProvider` themselves, as `packages/web/ui/tests/AGENTS.md` says), and the server harnesses under
`@kobato/server/tests/utils/` (session, mail capture, integration DBs, request context). The settings-mutation mock is
workspace-local: `packages/web/admin/tests/utils/settings-mutation-mock.ts`, imported as
`@kobato/web-admin/tests/utils/settings-mutation-mock`.

## Import surface

Import generic helpers as `@kobato/test/<name>.ts` — every module in `src/` is a product-free double or fake; reach for
an existing one before writing a new one. Load-bearing modules: `repo-root` (the single `REPO_ROOT` anchor — never
hand-count `../` hops), `vitest-base` (`vitestTestBase`, the pool/worker/isolation defaults every project spreads;
`maxWorkers: 4`, `isolate: false` — workers are reused, never restarted per file), `web-streams`
(`installWebStreamGlobals`, the vmThreads web-stream shim), and `vitest.define` (`testDefine`, the compile-time
`__APP_*__` constants).

No file-list scanners here and none may be added: project membership is expressed by include globs alone (directory
purpose + the `*.duckdb.test.ts` / `*.iso.test.ts` suffixes).

## Project registry

`projects/registry.ts` exports `allTestProjects`, the ordered table the root `vitest.config.ts` spreads into
`test.projects` (pinned by `apps/kobato/tests/arch/vitest-project-registry.test.ts`). Placement: multi-leaf projects
glob every leaf (`packages/shared/*/tests/{unit,snaps}/**` — a new leaf joins automatically; `base`'s tests sit one
directory deeper, under `tests/<directory>/`, so the same projects also glob
`packages/shared/*/tests/*/{unit,snaps}/**`); each module group has ONE multi-project owner
(`{api,db,server}-projects.ts`, which also owns its `*-duckdb` and `-iso-*` twins); single-project packages keep a
package-local `tests/**/vitest.config.ts` on `vitestTestBase`, referenced by path. Each app owns its projects in
`projects/<app>-app-projects.ts` (`kobato-app-projects.ts`, `sayaka-app-projects.ts` — `sayaka-unit` / `sayaka-snaps`
point their setups at `apps/sayaka/tests/utils/setup/{unit,snaps}.ts`: DOM/vmThreads wrappers with the blog-settings
bundle, no server/db seams; `sayaka-it` runs `apps/sayaka/tests/it` — the public route loaders driven through the
stub-Kobato harness — on the default `threads` pool behind `setup/it.ts`, the Node base with the blog-settings bundle,
with 30 s test and 120 s hook timeouts), and the workspace owns `projects/admin-projects.ts` (`admin-arch` on the
product-free Node setup, `admin-unit` / `admin-snaps` on vmThreads over
`packages/web/admin/tests/utils/setup/{unit,snaps}.ts`, and the forks-pool `admin-tz-unit` for the one runtime-`TZ`
write).

`projects/iso-project.ts` is the twin factory: `isoTestGlob(tree)` is the one spelling of `**/*.iso.test.{ts,tsx}` — a
tree's default project excludes it, its `-iso-` twin (`threads`, `isolate: true`) includes it, and both spread
`vitestTestBase`. `*.iso.test.ts` marks a file that cannot run on its tree's default pool: a mock-registering file on a
shared `threads` tree, or a file that needs a real realm on a `vmThreads` tree.

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

- Hard constraint: `vitestTestBase` keeps `isolate: false`, and `isolate: true` appears only in the projects listed in
  `ISOLATED_PROJECTS` (`apps/kobato/tests/arch/vitest-project-registry.test.ts`). A failing test is never fixed by
  flipping the default or isolating a whole tree: rename the file to `*.iso.test.ts`, or move the tree to `vmThreads`.
- Pool defaults from `vitestTestBase`: `pool: 'threads'`, `maxWorkers: 4` (`--maxWorkers=<n>` for more cores),
  `isolate: false` — a worker thread is reused across the files of its project instead of restarted per file. Each pool
  name has its own four-worker budget, so the `threads` and `vmThreads` pools can run at the same time.
- `vmThreads` (a fresh VM context per file, worker thread reused) is the pool for every tree whose files register module
  mocks or hold module-scoped product state: `server-unit`, `server-it`, `web-unit`, `ui-unit`, `ui-snaps`,
  `admin-unit`, `admin-snaps`, `app-unit`, `sayaka-unit`, `sayaka-snaps`, `inkling-unit`, `demo-unit`.
- A shared `threads` tree keeps only mock-free files: under a shared module registry a `vi.mock` binds into whichever
  importer is evaluated next and stays bound for every later file in the worker, so a mock-registering file there is
  named `*.iso.test.ts` and runs in the tree's `-iso-` twin. The same suffix moves a `vmThreads` file that needs a real
  realm — `instanceof Error` is false for an error thrown by `node:fs`, SQLite, or fetch from outside the VM context.
  `admin-tz-unit` runs forks for its runtime `process.env.TZ` write.
- `isolate: true` stays only where a whole project must boot per file: `app-it`, `app-duckdb`, and the `-iso-` twins.
- SQLite: one in-memory database per file, and one per worker on a shared `threads` tree; `clearAllTables(db)` resets
  tables and `sqlite_sequence` (server helpers may also reset server caches). File-backed flows:
  `createTestDatabaseFile()` returns a fresh migrated temp file.
- DuckDB: per-run sidecar files in the `*-duckdb` projects; DB-owned handles close directly after their awaited writes,
  server suites settle or reset batchers first.
- Fake timers go in `beforeEach`, never at module scope. Tests that write tables call `clearAllTables(db)` in
  `beforeEach`.
