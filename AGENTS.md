# Project conventions

## Workspace

pnpm monorepo with three top-level code roots — no new roots are created (`docs/` holds prose, gitignored `data/` holds
runtime state):

- `apps/` — deployable apps: `kobato` (the backend: the `@kobato/server` Hono app that `src/server.ts` boots through
  `startKobato` and default-exports, serving the workspace — the admin, editor, and auth SPA in `@kobato/web-admin` —
  under the base `/admin/`, so all workspace assets live at `/admin/assets/*`; builds the backend bundle
  `build/server/index.js` via `vite.backend.config.ts` and holds no React Router project), `sayaka` (the
  public-front-end split from ADR-0009: a React Router 8 SSR app that serves the public document perimeter and forwards
  `/rpc/*` and `/admin/*`+`/editor/*` to `kobato`), and `inkling-demo` (standalone Inkling playground, `pnpm demo`).
- `packages/` — product code that ships: `@kobato/server`, `@kobato/db`, `@kobato/api`, `@kobato/inkling` (Lexical
  editor with a React-free `/headless/` document model and the `/comment/` comment surface), the three front-end
  packages under `packages/web/` — `ui` (`@kobato/ui`, the design system and the document shell both app roots mount),
  `kit` (`web-kit`, the features both front-ends render that call a procedure — the notifications UI, `use-logout`,
  `toast-api-error`), and `admin` (`@kobato/web-admin`, the workspace as a React Router 8 **SPA** project —
  `ssr: false`, React 19, `appDirectory: 'src'`; the routes, the root, the UI tree, the document runtime, the styles —
  whose static client build lives under the `/admin/` base; it sits under `packages/` because it is not deployed on its
  own, ADR-0011 §4) — and four isomorphic React-free leaves under `packages/shared/*`. `@kobato/server` owns the
  backend's boot sequence (`bootstrap/start-kobato`) and the workspace-serving Hono app (`http/kobato-app`,
  `http/spa-shell`) — the app hands over the workspace build's location, nothing more. `@kobato/font-split`
  (`packages/font-split`) is the Rust font-slicing addon: the product reaches it only through `nativeRequire` with a
  specifier string, never an import.
- `tools/` — dev-support packages (`tsconfig`, `test`, `pack`, `trace`), none of which ships. Product `src/` never
  imports a tools package. `tools/test` holds everything a test needs (fixtures and doubles, the Vitest project table,
  the live-instance driver `src/instance/`, the Playwright journey support `src/browser/` with `playwright.config.ts`);
  `tools/pack` holds the SEA pipeline, the Vite plugins with the front-end config factory, and the release scripts, and
  depends on `tools/test` — never the reverse.

Package shape: `package.json`, `AGENTS.md` (required), `src/` (runtime source only), `tests/` mirroring `src/`, plus
`drizzle/` (db) or `assets|styles/` when owned; config files (`vite.config.ts`, `vitest.config.ts`, `tsconfig.json`,
`drizzle.config.ts`) live at the package root. `tools/` packages carry `package.json`, `AGENTS.md`, `src/` (except
config-only `tsconfig`), with `tests/` optional.

Naming (pinned by `apps/kobato/tests/arch/structure-conventions.test.ts`): `kebab-case.ts` modules, `PascalCase.tsx`
components, `use-kebab-case.ts(x)` hooks, `kebab-case-context.tsx` contexts, `*.controller.ts` controllers. Entity
directories and wire modules plural (`posts`, `comments`); mass nouns singular (`content`, `music`, `settings`,
`cache`). No `index.ts` barrels and no `export { X } from 'y'` re-exports — `packages/inkling`'s public barrel is the
one exception. A new directory needs three or more sibling modules or a documented layer.

Runtime facts:

- `pnpm dev` / `pnpm start` run with cwd at the repository root (cwd-anchored `kobato.config.json` / `./data`);
  build-time code anchors paths on `import.meta.url` or the repository root, never `process.cwd()`; the backend finds
  the workspace's client build by resolving `@kobato/web-admin`, never through the working directory.
- Three dev commands: `pnpm dev` (the backend on `127.0.0.1:4320`), `pnpm dev:admin` (the workspace on `127.0.0.1:4321`,
  proxying `/rpc`, `/health`, and `/ready` to the backend — `KOBATO_DEV_BACKEND_URL`, default `http://127.0.0.1:4320`),
  and `pnpm dev:public` (sayaka on port 4322 — its Vite config sets only the port, so it listens on Vite's default
  `localhost`, loopback only — forwarding to the workspace origin so `/admin/*` and `/rpc/*` both work through it;
  `SAYAKA_KOBATO_RPC_URL` points it at the backend directly when the workspace is not needed).
- Distribution is a pair of SEA executables built by `pnpm run sea:build` (`tools/pack`): `dist-sea/kobato` (the
  backend + the workspace SPA) and `dist-sea/sayaka` (the public site), each with a `.sha256` sidecar; runtime config is
  `kobato.config.json`, validated through `CONFIG_TABLE`. `apps/kobato/package.json` is the version source of truth —
  every package carries the same version (`pnpm version:sync <version>` repairs drift).
- Tailwind: package-owned `@source` partials, exactly one compile per surface — the ownership contract lives in
  `packages/web/admin/src/styles/AGENTS.md`.

## Documentation

- The root `README.md` is the repository's only README (vendored `.agents/skills/` payloads excepted); every other
  directory documents itself in `AGENTS.md`.
- Substantive conventions live in the package-root `AGENTS.md`; nested `src/**/AGENTS.md` is reserved for large internal
  layers. Docs load additively.
- Keep every AGENTS.md lean: contract, invariants, enforcing commands.

## Comments

Source carries no comments except:

- **Tool directives** — `@ts-expect-error` (always with a description; `ban-ts-comment` requires one),
  `/// <reference>`, `oxlint-*` / `eslint-*` suppressions, `oxfmt-ignore`, `@vitest-environment`, `c8 ignore`, and
  `@deprecated` tags.
- **License and attribution notices** for third-party code.

A comment must describe the present, never a past state of the tree (`apps/kobato/tests/arch/comment-hygiene.test.ts`).

## Import conventions

All imports are absolute and module specifiers omit `.ts`/`.tsx`; the single workspace path table is
`@kobato/tsconfig/tsconfig.base.json` (consumer tsconfigs only extend it). App source: `@/...` in `apps/kobato`,
`@sayaka/...` in `apps/sayaka`; app test helpers: `@tests/...` (kobato app tests only). Everything else:
`@kobato/<package>/...` — the workspace (`@kobato/web-admin`) included, which imports its own source as
`@kobato/web-admin/<path>` and its test helpers as `@kobato/web-admin/tests/<path>`, as every package does. No relative
specifiers in source or tests — exceptions: React Router generated `./+types/*`; the SEA pipeline's two build-output
entries (`tools/pack/src/sea/server-entry.ts` → kobato's `build/server/index.js`, `sayaka-entry.ts` → sayaka's) and
`sayaka-entry.ts`'s tools-internal `./sayaka-sea-cli`, so the pipeline holds no dependency on the sayaka app; generated
probe JavaScript; and import-scanner test fixtures.

- Source never imports a package's `tests/` tree; the one sanctioned cross-package seam is
  `@kobato/<owner>/tests/utils/<name>` — the canonical fixture registry lives in `tools/test/AGENTS.md`.
- Inkling internals: `@kobato/inkling-internal/...` is private to `packages/inkling/`. Public consumers use
  `@kobato/inkling`, `/headless*`, `/comment/*`, `/host-cards`, or `/styles/*`; the demo uses
  `@kobato/inkling-demo/...`.

## Layering

Dependency declarations are the enforcement; the graphs are pinned by the arch tests in `apps/kobato/tests/arch/`. This
section pins the direction graph only — package composition rules live in each package's own `AGENTS.md`.

- `packages/shared/*` leaves — `i18n` ← `base` ← `settings` ← `catalog` — are the dependency floor (the leaf DAG lives
  in `packages/shared/AGENTS.md`).
- `@kobato/api` → the shared leaves only.
- `@kobato/api/browser/*` is the built-in frontend's ambient, UI-bound assembly — the browser client, the TanStack Query
  binding, and the contract's data hooks (`use-notifications`); a browser hook imports the contract, the client, and
  TanStack Query — never a UI package, never message copy, never a consumer's route data (ADR-0011 §3,
  `apps/kobato/tests/arch/shared-react-free.test.ts`). `@kobato/server`, `@kobato/db`, and
  `packages/api/src/{contracts,rpc,client}` never import it.
- `@kobato/server` → `db`, `api`, the shared leaves, and Inkling only via `/headless`; never web or `ui` in `src/`.
  `bootstrap/start-kobato` is its composition root — the one module that knows every layer, which nothing inside the
  package imports — and `apps/kobato/src` reaches the package through it and the SEA VFS seam alone.
- `@kobato/db` → `settings`, `base`, inkling headless; it owns every query, transaction, native connection, and row
  model, never wire shapes.
- Web direction: `packages/web` holds three packages — `@kobato/ui` (`packages/web/ui`, the design system and the
  document shell), `@kobato/web-kit` (`packages/web/kit`, the features both front-ends render that call a procedure),
  and `@kobato/web-admin` (`packages/web/admin`, the workspace: the admin, editor, and auth SPA) — and the public UI
  lives in `apps/sayaka/src/ui` (ADR-0009, ADR-0011 §1/§4). `@kobato/ui` imports no `@kobato/api` module and no React
  Router: a front-end module that calls a procedure is a kit module or an app's own, and root route data reaches shared
  modules only as document facts through the document shell (`packages/web/ui/src/components/document-shell`, ADR-0011
  §1). The kit imports neither app, neither consuming surface, nor the workspace. The workspace imports the two rows
  above and the shared leaves — production source never imports `@kobato/server`, `@kobato/db`, or sayaka — and nothing
  imports it except `apps/kobato`: the backend resolves `@kobato/web-admin` by name to locate its client build, and
  `apps/kobato/tests` reach the package through its exports; the specifier stays banned in sayaka. The public site is
  `apps/sayaka` — an app, not a leaf — and may import the kit. Web packages never import `@kobato/server` in production
  source (kobato allows it tests-only; so does the workspace's test tree, in the five files
  `packages/web/admin/AGENTS.md` names, both backend packages declared there as test dependencies only). The browser
  oRPC client is typed exclusively through `@kobato/api`.
- `@kobato/ui` → `base`, `settings`, `i18n`. `@kobato/inkling` → `ui`, `i18n`, `base`.
- `apps/kobato/src` is the backend entry alone: `server.ts` calls `startKobato` and default-exports the app, and
  `server/*` holds the two app-side seams (the workspace build's location, the Vite dev server reference). It carries no
  routes and no UI; every workspace module lives in `@kobato/web-admin`.
- `apps/sayaka` is the public-front-end split (ADR-0009): it never imports `@kobato/server`, `@kobato/db`, or
  `@kobato/web-admin` and never touches the database — it reaches `kobato` exclusively over oRPC
  (`createKobatoServerClient` from `@kobato/api`) and HTTP forwarding. Its declared-dependency allow-list and src
  targets are pinned in `apps/kobato/tests/arch/package-dag.test.ts`.
- Refactor from architectural correctness, not minimal diff size.

## Skills

`.agents/skills/` overrides these conventions on conflict. Repo-owned skills (`release`) live there directly; synced
skills are pinned in `skills-lock.json`.

## Build & CI

`pnpm run dev`, `pnpm run fmt`, `pnpm run lint`, `pnpm run test`, `pnpm run build`. Before committing:
`pnpm run fmt && pnpm run lint`, then `pnpm run test`, then `pnpm run build`. `pnpm run build` builds the workspace
(`packages/web/admin` → `packages/web/admin/build/client`), the backend (`apps/kobato` → `build/server/index.js`), and
sayaka, in that order; `pnpm run dev:public` runs the sayaka dev server, and `pnpm run split:smoke` boots the built
kobato + sayaka pair and verifies the split deployment perimeter (install gate, CSP/ETag/304, forwarded RPCs, rate-limit
keying).

Dev workflow: three commands, three processes. `pnpm run dev` is the backend — a Vite SSR host
(`apps/kobato/vite.config.ts`) on 4320 whose `honoDevHost` plugin (`@kobato/pack/vite/hono-dev-host`) loads
`apps/kobato/src/server.ts` through `@hono/vite-dev-server`, publishes the Vite dev server on the `globalThis` slot so
`startKobato` adopts its `httpServer` instead of binding a port, and serves `/rpc/*`, `/health`, and `/ready` through
the Hono app with server HMR. `pnpm run dev:admin` is the workspace on 4321 (`react-router dev packages/web/admin`):
React Router's dev middleware serves the `/admin/*` + `/editor/*` documents (and `.data` requests) while `/rpc`,
`/health`, and `/ready` proxy to the backend (`KOBATO_DEV_BACKEND_URL`, default `http://127.0.0.1:4320`).
`pnpm run dev:public` adds the public origin on 4322; sayaka forwards `/rpc/*` and `/admin/*`+`/editor/*` to a single
target — in dev the workspace origin, which serves both through its proxy (`SAYAKA_KOBATO_RPC_URL`, default
`http://127.0.0.1:4321/rpc`).

`pnpm run bench:font-split` is local-only (`packages/font-split/scripts/bench/`): it regenerates
`packages/font-split/BENCHMARK.md`, its charts and `benchmark/results.json` from the production fonts. Rerun it when a
font-split change is meant to move those numbers and commit the regenerated files with it.

`pnpm run lint` is the one static gate: it runs `react-router typegen` for the workspace and sayaka (each package script
`cd`s to the repository root and names its project directory, so the generated types land under that package from any
working directory; route modules import generated `./+types/*`), then `oxlint -c oxlint.config.ts` once over the whole
workspace — lint rules and TypeScript compiler diagnostics in a single pass. There is no separate type-check command and
`tsc` is never run (`oxlint.config.ts` sets `typeAware`/`typeCheck`). Each file type-checks through its nearest
`tsconfig.json`, so a new package or config file needs no root-level registration. The root `tsconfig.json` covers only
the root `*.config.ts` files. oxlint skips `.gitignore`d and `ignorePatterns` paths: a gitignored tsconfig input (the
generated `packages/web/admin/.react-router/types/` and `apps/sayaka/.react-router/types/`) is never type-checked.

## Tests

Tests live next to the covered package — no root-level test tree.

- Single-purpose rule: unit (pure logic, mocks) → `tests/unit/<mirrored-path>.test.ts`; integration (DB / real RPC) →
  `tests/it/`; snapshots → `tests/snaps/`. One file never mixes purposes. Tests that spin up the real DuckDB engine live
  in `tests/it/` named `*.duckdb.test.ts`; the suffix routes them into the owning package's `-duckdb` project
  (`pnpm test:duckdb`; they also run under `pnpm test`). `packages/shared/base` mirrors each of its five directories
  under its name — `tests/<directory>/unit/<mirrored-path>.test.ts`.
- Project registration: the root `vitest.config.ts` spreads `allTestProjects` from `@kobato/test/projects/registry` —
  the explicit, ordered project table. No config glob discovery; every test file is matched exactly once and
  `e2e`/`browser` are registered nowhere (`apps/kobato/tests/arch/vitest-project-registry.test.ts`).
- The live-instance suites (`split:smoke`, `sea:smoke`, `sea:e2e`, `sea:browser`, `trace:smoke`) boot the real
  kobato+sayaka pair or the dev servers through the instance driver in `tools/test/src/instance/` and drive the browser
  through `tools/test/src/browser/` (`tools/test/AGENTS.md`); the e2e and browser trees import
  `@kobato/test/instance/client/*` and `@kobato/test/browser/*`.
- Import `describe`, `it`, `expect`, `vi` from `vitest`; run through the root `test*` scripts; `pnpm test <path>` for
  path filters; never select Vitest projects on the command line.
- Pool/isolation: every project spreads `vitestTestBase` from `@kobato/test/vitest.base.ts` — `maxWorkers: 4`,
  `isolate: false`, so a worker thread is reused across files instead of restarted per file. Trees whose files register
  module mocks (`vi.mock`) or hold module-scoped product state run on `vmThreads` (a fresh VM context per file, worker
  reused); a file that needs an isolated real thread is named `*.iso.test.ts` and routed into its tree's `-iso-` twin.
  Pool defaults, the per-project table, and the `*.iso` contract live in `tools/test/AGENTS.md`.
- Hygiene: no `process.chdir()` (spy on `process.cwd`), no runtime `process.env.TZ` writes outside the forks project,
  "no browser globals" tests declare `@vitest-environment node`, realm-safe DOM comparisons use identity (`!==`).
- Tests import production code through the same package-root specifiers; test-local helpers may stay relative. `any`,
  `as`, `ts-expect-error` are acceptable escapes for intentionally partial mocks.
- Coverage measures the backend/app runtime surface — `apps/kobato/src`, `apps/sayaka/src`, `api`, `db`, `server`, and
  `shared/*`. The product UI trees — everything under `packages/web` (`admin`, `kit`, `ui`), `apps/sayaka/src/ui`, and
  `@kobato/inkling` — sit outside the workspace coverage thresholds by design.

## Git

Semantic commits in English (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`), imperative, lowercase subject,
no trailing period. Do not create commits unless explicitly asked.

## Release

`/release <version> <next-version>` — the skill automates the lifecycle. No PRs: direct fast-forward merge develop →
main. Version is baked at build time via `vite.config.ts` `define.__APP_VERSION__`.

## Defensive constraints

- Banned layer-root directories in any package: `actions/`, `middleware/`, `layouts/`, `services/`, `hooks/`, `db/`,
  `content/`, `assets/scripts/`. Sole exception: Inkling's `src/hooks/` and `src/services/`.
- Preserve public URLs, feed URLs, image endpoints, WordPress compatibility routes, and pagination routes.
- Never wrap SSR-critical DOM in a lazy `<Suspense>` whose fallback differs from the resolved content (React #418
  hydration mismatch). The root `LazyMotionConfig` imports eagerly; other SSR-critical DOM uses a hydration-safe
  `useSyncExternalStore` gate or an eager import. Hydration mount points in projected `body_html` are parity-pinned
  (`musicPlayerFallbackHtml` ⇔ `MusicPlayerCard` paused).
- JS-driven animation goes only through the `@kobato/ui/components/lazy-motion` facade — never a direct runtime
  `motion/react` import. Simple hover/state styling stays on CSS `transition-*`.
- Never use React `<ViewTransition>` / `addTransitionType` / `document.startViewTransition` for element or navigation
  animation — named captures paint in the `::view-transition` overlay above every z-index. The theme-switch wipe in
  `packages/web/ui/src/lib/ThemeProvider.tsx` is the sole consumer.
- `isolate: false` in `vitestTestBase` is a hard constraint: never flip the default back to `isolate: true`, and never
  add `isolate: true` to a project outside `ISOLATED_PROJECTS` in
  `apps/kobato/tests/arch/vitest-project-registry.test.ts`. A file that cannot share a worker is renamed `*.iso.test.ts`
  into its tree's isolated twin; a tree that cannot share a module registry moves to `vmThreads`.

## Dependencies

- Every version lives in the root `pnpm-workspace.yaml` `catalog:` table; `taze` edits it in place. Every catalog entry
  carries `^`; exact resolved versions are locked in `pnpm-lock.yaml`.
- Each package declares every external package it imports — an undeclared import fails typecheck. Workspace links are
  `"workspace:*"`.
- Only native-dynamic-library packages required at production runtime belong in the ROOT `package.json` `dependencies`:
  `@napi-rs/canvas`, `sharp`, `@duckdb/node-api`, `@kobato/font-split` (workspace addon, `nativeRequire`-only).
  Everything else is a devDependencies entry of the importing package — the SEA binary builds from the full dev install.
- Engine-upgrade protocol (drizzle-orm/kit pairing, `.mapWith(Number)` on raw integer `sql` fields, the DuckDB 2.0 peer
  exception) lives in `packages/db/AGENTS.md`.
