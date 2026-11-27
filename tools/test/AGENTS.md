# @kobato/test — everything a test needs

`@kobato/test` holds three trees: the generic Vitest infrastructure, the out-of-process instance driver
(`src/instance/` + `src/process.ts`), and the Playwright journey support (`src/browser/` + `playwright.config.ts`). The
first is PRODUCT-FREE — it imports no `@kobato/*` product package; the other two reach exactly `@kobato/settings`, the
`@kobato/base/utils` sub-tree, and their own modules (`apps/kobato/tests/arch/package-dag.test.ts` pins both halves).
Nothing here imports `@kobato/pack`: `pack` → `test` is the only direction between them. A helper that models a product
shape (settings bundle, DB lifecycle, oRPC caller, render helpers, lexical fixtures) lives in ONE canonical owner
package's `tests/utils/`, imported cross-package as `@kobato/<owner>/tests/utils/<name>.ts` — the one sanctioned
cross-package `tests/` edge (`apps/kobato/tests/arch/package-dag.test.ts`). Product-coupled fixtures must not move back
here. Canonical fixture owners: `@kobato/settings/tests/utils/blog-settings.ts`, `@kobato/i18n/tests/utils/i18n.ts`,
`@kobato/api/tests/utils/{catalog,notifications}.ts`, `@kobato/inkling/tests/utils/lexical.ts`,
`@kobato/web-kit/tests/utils/render.tsx`, `@kobato/ui/tests/utils/{i18n-render,hook}.tsx`,
`@kobato/ui/tests/utils/document-facts.ts` (the `DocumentFacts` fixture, mounted only by the kit's canonical render
helper above — the `@kobato/ui` render helpers mount none, and tests mount `DocumentFactsProvider` themselves, as
`packages/web/ui/tests/AGENTS.md` says), and the server harnesses under `@kobato/server/tests/utils/` (session, mail
capture, integration DBs, request context). The settings-mutation mock is workspace-local:
`packages/web/admin/tests/utils/settings-mutation-mock.ts`, imported as
`@kobato/web-admin/tests/utils/settings-mutation-mock`.

## Import surface

Import generic helpers as `@kobato/test/<name>.ts` — every module in `src/` outside `instance/`, `browser/`, and
`process.ts` is a product-free double or fake; reach for an existing one before writing a new one. Load-bearing modules:
`repo-root` (the single `REPO_ROOT` anchor — never hand-count `../` hops), `vitest-base` (`vitestTestBase`, the
pool/worker/isolation defaults every project spreads; `maxWorkers: 4`, `isolate: false` — workers are reused, never
restarted per file), `web-streams` (`installWebStreamGlobals`, the vmThreads web-stream shim), and `vitest.define`
(`testDefine`, the compile-time `__APP_*__` constants).

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
`projects/<app>-app-projects.ts` (`kobato-app-projects.ts`, `sayaka-app-projects.ts` — the sayaka projects point their
setups at `apps/sayaka/tests/utils/setup/{unit,snaps}.ts`: DOM/vmThreads wrappers with the blog-settings bundle, no
server/db seams), and the workspace owns `projects/admin-projects.ts` (`admin-arch` on the product-free Node setup,
`admin-unit` / `admin-snaps` on vmThreads over `packages/web/admin/tests/utils/setup/{unit,snaps}.ts`, and the
forks-pool `admin-tz-unit` for the one runtime-`TZ` write).

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

## Instance driver (`src/instance/`)

Everything that drives a kobato instance as a REAL separate process — two halves with no dependencies between them:

- **Lifecycle** (CLI entry scripts only) — `temp.ts` (per-run temp roots and smoke databases), `sea-instance.ts` (the
  built SEA binaries as HTTP instances: `bootServer` for kobato, `bootSayakaServer` for sayaka, plus the
  `seaInstanceEnv` / `sayakaInstanceEnv` env tables), `dev-instance.ts` (the repository DEV servers:
  `bootBackendDevServer` boots kobato on a free port with the converged config, `bootAdminDevServer` boots the workspace
  on another with `KOBATO_DEV_BACKEND_URL` pointing at that backend, and `bootSayakaDevServer` boots sayaka with the
  caller's `SAYAKA_KOBATO_RPC_URL` — a dev instance of kobato is the backend plus the workspace, and suites boot either
  or both), `seed.ts` (plain-SQL state for STOPPED instances), `suite-instance.ts` (the PAIR boot: fresh kobato proves
  the /health 303 gate → fresh sayaka proves the / 303 gate through sayaka → stop kobato → seed → restart kobato behind
  the RUNNING sayaka; `stopSuiteInstance` SIGTERMs both and removes the temp root), `analytics.ts` (the DuckDB sidecar
  AFTER shutdown), `split-smoke.ts` (the `split:smoke` entry: boots the BUILT `apps/kobato` + `apps/sayaka` node servers
  as a pair — or, with `--sea`, the `dist-sea/kobato` + `dist-sea/sayaka` binaries plus two `--version` identity checks
  — and verifies the ADR-0009 split perimeter — install gate, CSP nonce/ETag/304 on the home document, modulepreload
  links + the inline route-warmup idle script on that document, the uninstalled setup shell hydrating through headless
  Chrome with its brand logo and favicon answering 200 pre-install, fingerprint-asset caching, the legacy `/tags` and
  `/search` 301 redirects forwarded through sayaka, 404s for unknown category/tag/post/page slugs, ETag-bearing
  `/archives` and `/categories`, a seeded post detail round-trip (admin signin + `upsertMeta` + `publishLatest` on
  kobato, then 200 + Content-Language/ETag and a conditional 304 at sayaka), the forwarded `/admin/signin` document and
  its entry chunk through sayaka, forwarded bootstrap parity, kobato's own origin answering 404 for the former public
  document URLs (the Webmention receive and RUM intake paths included), the binary resource families served by sayaka's
  procedure pairs (branding assets, OG/calendar/avatar images byte-identical to their procedure answers, an embedded
  font and a storage object streaming with Range/304/416 semantics), the two inbound protocols answered through sayaka's
  perimeter handlers byte-identically to the captured router answers (webmention invalid 400 / accepted 202 /
  unknown-target 404 / oversized 413 / disabled 410; RUM intake 404 while the relay is inactive and 415 for compressed
  batches), and resource rate-limit keying on the sayaka-forwarded visitor address). In plain-node mode `split-smoke.ts`
  starts kobato from the temp cwd with `--config <tempRoot>/kobato.config.json` (config and data paths stay absolute in
  the temp root): kobato resolves its client build through the package — `clientAssetsRoot()` in
  `apps/kobato/src/server/client-assets-root.ts` resolves `@kobato/web-admin/package.json` and hands `startKobato` that
  package's `build/client` directory — never through the working directory; under `--sea` both binaries resolve their
  client assets from the VFS and the cwd is the temp root. The seeded-post helpers stay inline in `split-smoke.ts` —
  `client/http.ts`'s parameter properties are not plain-node type-strippable. The sayaka DEV boot runs the app's own
  `dev` script (`pnpm --filter <app> run dev --host …`) so the app-script's repoRoot cwd and app-dir positional stay
  authoritative.
- **`client/`** (what the live-instance suites speak) — `http.ts` (`E2eClient`, the `KOBATO_E2E_*` env contract —
  `KOBATO_E2E_BASE_URL` is kobato's origin for backend-direct checks, `KOBATO_E2E_PUBLIC_URL` is sayaka's origin for
  everything a browser reaches; the oRPC signin helpers: `bootstrapCsrfToken` → `loginAdmin` answers the
  `AuthFlowOutput` shape, `readAuthFlow` decodes it), `rpc.ts` (`callE2eRpc`; `path` is the camelCase structural router
  path — kebab-case `.route()` strings are OpenAPI metadata, not the RPC wire path), `browser-env.ts` (the
  `KOBATO_BROWSER_*` env contract; `KOBATO_BROWSER_BASE_URL` is the sayaka origin — the one listener a browser needs).

`@kobato/pack`'s `src/sea/{smoke,e2e,browser}.ts` and `@kobato/trace`'s `src/smoke.ts` compose both halves;
`apps/kobato`'s `tests/e2e` and `tests/browser` and `apps/sayaka`'s two suites import `@kobato/test/instance/client/*`
and `@kobato/test/browser/*`. The trace smoke boots all three dev servers through `dev-instance.ts` and drives the admin
through the workspace origin.

- `src/process.ts` (the process primitives every CLI script shares: `fail` (the one print-and-exit failure helper),
  `sleep`, `pickFreePort`, `fetchManual`, `scrubbedParentEnv`, `watchChildExit` / `raceChildExit`) and the driver import
  only `@kobato/settings`, `@kobato/base/utils`, `@kobato/test/repo-root`, and their own modules — they drive built
  artifacts and running processes, never a source graph, and never reach `src/browser/`, the SEA pipeline, or the Vite
  plugins (pinned by `apps/kobato/tests/arch/package-dag.test.ts`).
- The config file always lives inside the per-run temp root; config vars never come from the parent env (env > file
  would silently override the converged file); seeding only touches a STOPPED database; every boot pairs with a stop
  (`stopDevServer`, `stopSuiteInstance`) that SIGTERMs the child and removes the temp root — entry scripts call it from
  `finally`. A sayaka boot survives kobato restarts (per-request upstream clients), so suite boots restart kobato behind
  a running sayaka.
- Entry scripts run under plain `node` type-stripping, so every module they reach — `src/process.ts`, the lifecycle
  half, and `client/browser-env.ts` — stays free of non-strip TS syntax (no parameter properties, enums, or namespaces);
  `client/http.ts` and `client/rpc.ts` load under Vitest, Playwright, or `vite-node` only. Keep every module importable
  with zero side effects.

## Browser journeys (`src/browser/` + `playwright.config.ts`)

- `src/browser/` runs under Playwright only: `journey.ts` (signin through the oRPC auth flow, page journeys,
  console/hydration probes), `settings-api.ts` (admin HTTP staging over `client/`), `fixtures.ts` (the `test`/`expect`
  factory both apps' specs import), `global-setup.ts` (the one Playwright global setup both projects share — stages one
  post and resets the general-settings baseline through the sayaka-forwarded admin). It imports `@playwright/test`,
  `@kobato/base/utils`, the driver's `client/`, and its own modules; the driver never imports it (pinned).
- `playwright.config.ts` — the real-browser journey runner config: two projects over ONE booted pair — kobato's
  workspace journeys in `apps/kobato/tests/browser/` and sayaka's public journeys in `apps/sayaka/tests/browser/`, each
  with its own `testDir` and output dir, one shared `globalSetup` (`src/browser/global-setup.ts`), and `baseURL` = the
  sayaka origin. Every path is anchored on `REPO_ROOT` from `@kobato/test/repo-root`, so the HTML report and the
  per-project results land under `apps/<app>/tmp/` whatever directory the runner is spawned from. The browser channel is
  the bundled Chromium unless `KOBATO_BROWSER_CHANNEL` names another (set it to `chrome` to launch the installed Google
  Chrome — no Playwright browser download needed); `KOBATO_BROWSER_HEADLESS=0` shows the window.
- `@kobato/pack`'s `src/sea/browser.ts` spawns
  `pnpm --filter @kobato/test exec playwright test --config <absolute path to this config>` and only boots instances,
  drives the browser, and reports — `test:browser` runs the journeys against `KOBATO_BROWSER_BASE_URL` when it is set,
  and otherwise boots the pair exactly like `sea:browser`.

## Live-instance suites

- `pnpm run split:smoke [--sea]` (this package's `split:smoke` script) — the ADR-0009 split perimeter smoke (54 checks)
  over the built node servers; `--sea` boots `dist-sea/kobato` + `dist-sea/sayaka` instead and adds the two `--version`
  identity checks.
- `pnpm run sea:smoke [kobato-binary]` / `sea:e2e [kobato-binary]` / `sea:browser [kobato-binary]` / `test:browser` —
  `@kobato/pack`'s entry scripts (`tools/pack/src/sea/`) over the booted pair, composing the driver above (coverage in
  `apps/kobato/tests/AGENTS.md` and `apps/sayaka/AGENTS.md`): the managed smoke (budgets, versions, probes, natives,
  worker pool, fresh-pair boot, SIGTERM ×2, cache reuse, config convergence + reduced-env restart, seeded home
  document + assets through sayaka, page views + DuckDB round-trip), the two e2e trees over the pair, and the browser
  journeys. `--external <sayaka-url>` runs only the public HTTP checks; `--binary-only` the service-free ones. A binary
  argument names the KOBATO binary; the sayaka binary is its `sayaka` sibling (same directory, same suffix), or the
  default `dist-sea/sayaka` when no argument is given. All three default to (and document) the `dist-sea` pair.
- `pnpm run trace:smoke` — `@kobato/trace`'s end-to-end signal check over the three DEV servers
  (`tools/trace/AGENTS.md`).
