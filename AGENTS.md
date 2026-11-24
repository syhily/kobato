# Project conventions

## Workspace

pnpm monorepo with four top-level roots; nothing else is created at the root:

- `apps/` — deployable apps: `kobato` (React Router 8 Framework Mode, SSR, React 19, `appDirectory: 'src'`) and
  `inkling-demo` (standalone Inkling playground, `pnpm demo`).
- `packages/` — product code that ships: `@kobato/server`, `@kobato/db`, `@kobato/api` (wire contracts, rpc metadata,
  the React-free client), `@kobato/ui`, `@kobato/inkling` (Lexical editor with a React-free `/headless/` document
  model), `packages/web/*` (`web-client`, `web-public`, `web-admin`), and nine isomorphic React-free leaves under
  `packages/shared/*`.
- `tools/` — dev-support packages (`tsconfig`, `test`, `pack`, `trace`, `font-split`). Product `src/` never imports a
  tools package; `font-split` is the sole carve-out — its compiled Node-API addon ships as a SEA native, loaded only
  through `nativeRequire` specifier strings (never an import).
- `scripts/` — standalone ops scripts (shell / Node builtins only); anything needing project modules belongs in
  `tools/`.

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
  build-time code anchors paths on `import.meta.url`, never `process.cwd()`.
- Distribution is a single SEA executable; runtime config is `kobato.config.json`, validated through `CONFIG_TABLE`.
  `apps/kobato/package.json` is the version source of truth — every package carries the same version
  (`pnpm version:sync <version>` repairs drift).
- Tailwind: package-owned `@source` partials, exactly one compile per surface (`styles/admin.css` / `styles/public.css`)
  composing them via CSS `@import` behind the UI token root (`ui.css` first). Partials carry no `@import 'tailwindcss'`,
  no layer-order declaration, never re-declare the UI-owned `dark` variant, no cross-package `@source`
  (`apps/kobato/tests/arch/tailwind-source-ownership.test.ts`).

## Documentation

- The root `README.md` is the repository's only README; every other directory documents itself in `AGENTS.md`.
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
`@kobato/tsconfig/tsconfig.base.json` (consumer tsconfigs only extend it). Workspace export wildcards carry `.ts`/`.tsx`
fallback targets so the same specifiers resolve under native Node.

- App source: `@/...`; app test helpers: `@tests/...` (app tests only). Everything else: `@kobato/<package>/...`.
- Source never imports a package's `tests/` tree. The canonical shared fixtures — settings blog-settings, i18n
  translator, api catalog, inkling lexical, web-client render — are imported cross-package as
  `@kobato/<owner>/tests/utils/<name>`, the one sanctioned seam (`apps/kobato/tests/arch/package-dag.test.ts`).
- Inkling internals: `@kobato/inkling-internal/...`, private to `packages/inkling/` plus its one white-box parity test.
  Public consumers use `@kobato/inkling`, `/headless*`, `/host-cards`, or `/styles/*`; the demo uses
  `@kobato/inkling-demo/...`.
- No relative specifiers in source or tests. Exceptions: React Router generated `./+types/*`, the SEA build-output
  entry, generated probe JavaScript, and import-scanner test fixtures.

## Layering

Dependency declarations are the enforcement; the graphs are pinned by the arch tests in `apps/kobato/tests/arch/`.

- `packages/shared/*`: runtime-isomorphic, React-free. `@kobato/settings` never imports `@kobato/api`; `catalog` and the
  api `contracts/` layer reach the Lexical document model only via `@kobato/inkling/headless` (catalog type-only).
- `@kobato/api` → the shared leaves only. `src/rpc/` is metadata-only, composed from the Zod schemas in `src/contracts/`
  (never a copy), declared exclusively with `defineProcedure` (`src/rpc/define-procedure.ts` is the single `oc.route`
  call site) — its `~orpc.route` literal brand feeds the server's `ContractImplementation` check and plain `oc.route`
  contracts fail closed. Anonymous-read eligibility is declared per procedure with `{ publicRead: true }`, which puts
  `~orpc.meta.publicRead === true` on the procedure (oRPC's `$meta`, never the route record); the server derives its
  CSRF public-read exemption from that flag and enforces it server-side, and eligibility is never inferred from the HTTP
  method. `src/contracts/` mirrors the rpc audiences — `public/`, then `account/`, then `admin/` — with the
  audience-free generic wire vocabulary in the root `primitives.ts`: a lower layer never imports a higher one, and
  vocabulary a second audience needs lives in the lower layer (no duplicated schemas, no re-export shims).
  `src/contracts/` imports no `@orpc/*`. `src/client/` is the React-free transport factory
  `createKobatoClient({ url, fetch?, getHeaders? })` plus wire error decoding; `@orpc/client` stays inside `src/client/`
  and React Query integration stays at the web-client seam. The server implements through the
  `implement{Public,Authed,Author,Admin}` bases in `packages/server/src/http/orpc-base.ts`.
- `@kobato/server` → `db`, `api`, the shared leaves, and Inkling only via `/headless`; never web or `ui` in `src/`.
  Production source never imports SQLite/Drizzle/DuckDB drivers, builds SQL, or unwraps native handles
  (`persistence-ownership.test.ts`). First-party JSON, File/Blob, binary streams, and event iterators use oRPC; only
  audited external-protocol/public/operational resources remain in `api-resource-surface.test.ts`.
- `@kobato/db` → `settings`, `utils`, inkling headless; it owns every query, transaction, native connection, and row
  model, never wire shapes. Server passes opaque `Database`/`AnalyticsHandle` tokens to semantic operations.
- Web direction is one-way: `web-admin` → `web-public` / `web-client`, `web-public` → `web-client`. Web leaves never
  import `@kobato/server` (admin allows it tests-only). The browser oRPC client is typed exclusively through
  `@kobato/api`.
- `@kobato/ui` → `settings`, `i18n`, `utils`, plus the `components/music-player/` family. `@kobato/inkling` → `ui`,
  `sanitize`, `assets`, `utils`; its document model ships React-free under `/headless`.
- `apps/kobato/src/routes/*` wire only: extract request context, call orchestrators, render — no DB imports or business
  logic inline. Cross-domain imports under `packages/server/src/domains/` stay acyclic.
- Refactor from architectural correctness, not minimal diff size.

## Skills

`.agents/skills/` overrides these conventions on conflict; `drizzle` and `taze` are CLI-generated gitignored symlinks,
`.claude/skills/` mirrors repo-owned skills: `react-router-framework-mode`, `vercel-react-best-practices`,
`vercel-geist-design-system`, `release`.

## Build & CI

`pnpm run dev`, `pnpm run fmt`, `pnpm run lint`, `pnpm run test`, `pnpm run build`. Before committing:
`pnpm run fmt && pnpm run lint`, then `pnpm run test`, then `pnpm run build`.

`pnpm run lint` is the one static gate: it runs `react-router typegen` (route modules import generated `./+types/*`),
then `oxlint -c oxlint.config.ts` once over the whole workspace — lint rules and TypeScript compiler diagnostics in a
single pass. There is no separate type-check command and `tsc` is never run (`oxlint.config.ts` sets
`typeAware`/`typeCheck`). Each file type-checks through its nearest `tsconfig.json`, so a new package or config file
needs no root-level registration. The root `tsconfig.json` covers only the root `*.config.ts` files and `scripts/`.
oxlint skips `.gitignore`d and `ignorePatterns` paths: a gitignored tsconfig input (the generated
`apps/kobato/.react-router/types/`) is never type-checked.

## Tests

Tests live next to the covered package — no root-level test tree.

- Single-purpose rule: unit (pure logic, mocks) → `tests/unit/<mirrored-path>.test.ts`; integration (DB / real RPC) →
  `tests/it/`; snapshots → `tests/snaps/`. One file never mixes purposes. Tests that spin up the real DuckDB engine live
  in `tests/it/` named `*.duckdb.test.ts`; the suffix routes them into the owning package's `-duckdb` project
  (`pnpm test:duckdb`; they also run under `pnpm test`).
- Project registration: the root `vitest.config.ts` spreads `allTestProjects` from `@kobato/test/projects/registry` —
  the explicit, ordered project table. No config glob discovery; every test file is matched exactly once and
  `e2e`/`browser` are registered nowhere (`apps/kobato/tests/arch/vitest-project-registry.test.ts`).
- Import `describe`, `it`, `expect`, `vi` from `vitest`; run through the root `test*` scripts; `pnpm test <path>` for
  path filters; never select Vitest projects on the command line.
- Pool/isolation: every project spreads `vitestTestBase` from `@kobato/test/vitest.base.ts` — `pool: 'threads'`,
  `maxWorkers: 4` (`--maxWorkers=<n>` for more cores), `isolate: true` — so `vi.mock` holders, product global state, and
  native engines get a fresh module registry per file (no mock-file scanning, no shared/isolated split). DOM-heavy trees
  override `pool: 'vmThreads'` (`web-unit`, `web-snaps`, `ui-unit`, `demo-unit`, `inkling-unit`); `web-tz-unit` runs
  forks for its runtime `process.env.TZ` write.
- Hygiene: no `process.chdir()` (spy on `process.cwd`), no runtime `process.env.TZ` writes outside the forks project,
  "no browser globals" tests declare `@vitest-environment node`, realm-safe DOM comparisons use identity (`!==`).
- Tests import production code through the same package-root specifiers; test-local helpers may stay relative. `any`,
  `as`, `ts-expect-error` are acceptable escapes for intentionally partial mocks.
- Coverage measures the backend/app runtime surface plus `@kobato/web-client` — `apps/kobato/src`, `api`, `db`,
  `server`, `shared/*`, and `web/client`. The product UI trees — `web-admin`/`web-public`, `@kobato/ui`, and
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
- No `apps/kobato/src/blog.config.ts`, `DEFAULT_SETTINGS`, `BlogConstants`, per-section "reset to defaults" actions, or
  a monolithic `BlogConfigContext` — use per-section hooks.
- No `data-admin-shell` selector, no `packages/web/admin/src/lib/`, no `@kobato/web-admin/ui/shadcn/components/ui/`
  nesting.
- Preserve public URLs, feed URLs, image endpoints, WordPress compatibility routes, and pagination routes.
- `*.server.ts` is redundant inside `packages/server/src/`.
- Do not remove the process-level `unhandledRejection` handler in `packages/server/src/infra/lifecycle.ts` — streamed
  loader promises require it.
- Never wrap SSR-critical DOM in a lazy `<Suspense>` whose fallback differs from the resolved content (React #418
  hydration mismatch). The root `LazyMotionConfig` imports eagerly; other SSR-critical DOM uses a hydration-safe
  `useSyncExternalStore` gate or an eager import. Hydration mount points in projected `body_html` are parity-pinned
  (`musicPlayerFallbackHtml` ⇔ `MusicPlayerCard` paused).
- JS-driven animation goes only through the `@kobato/ui/components/lazy-motion` facade — never a direct runtime
  `motion/react` import. Simple hover/state styling stays on CSS `transition-*`.
- Never use React `<ViewTransition>` / `addTransitionType` / `document.startViewTransition` for element or navigation
  animation — named captures paint in the `::view-transition` overlay above every z-index. The theme-switch wipe in
  `packages/ui/src/lib/ThemeProvider.tsx` is the sole consumer.

## Dependencies

- Every version lives in the root `pnpm-workspace.yaml` `catalog:` table; `taze` edits it in place. Every catalog entry
  carries `^`; exact resolved versions are locked in `pnpm-lock.yaml`.
- Each package declares every external package it imports — an undeclared import fails typecheck. Workspace links are
  `"workspace:*"`. The server/app `drizzle-orm` devDependencies are test-only for seed/assertion code; production source
  must not import them.
- Only native-dynamic-library packages required at production runtime belong in the ROOT `package.json` `dependencies`:
  `@napi-rs/canvas`, `sharp`, `@duckdb/node-api`, `@kobato/font-split` (workspace addon, `nativeRequire`-only).
  Everything else is a devDependencies entry of the importing package — the SEA binary builds from the full dev install.
- Upgrade `drizzle-orm` / `drizzle-kit` together and re-run the migration contract tests on upgrades. Raw integer `sql`
  fields in mapped selects need an explicit `.mapWith(Number)` — rc.6 decodes them as `bigint` on `node:sqlite`.
- `@duckdbfan/drizzle-duckdb`'s DuckDB 2.0 peer exception requires the real DuckDB suites on upgrades.
