# Project conventions

## Workspace

pnpm monorepo with four top-level code roots — no new roots are created (`docs/` holds prose, gitignored `data/` holds
runtime state):

- `apps/` — deployable apps: `kobato` (React Router 8 Framework Mode, SSR, React 19, `appDirectory: 'src'`) and
  `inkling-demo` (standalone Inkling playground, `pnpm demo`).
- `packages/` — product code that ships: `@kobato/server`, `@kobato/db`, `@kobato/api`, `@kobato/ui`, `@kobato/inkling`
  (Lexical editor with a React-free `/headless/` document model), `packages/web/*` (`web-client`, `web-public`,
  `web-admin`), and nine isomorphic React-free leaves under `packages/shared/*`.
- `tools/` — dev-support packages (`tsconfig`, `test`, `pack`, `trace`, `font-split`). Product `src/` never imports a
  tools package; `font-split` is the sole carve-out, loaded only through `nativeRequire` (never an import).
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
- Tailwind: package-owned `@source` partials, exactly one compile per surface — the ownership contract lives in
  `apps/kobato/src/styles/AGENTS.md`.

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
`@kobato/tsconfig/tsconfig.base.json` (consumer tsconfigs only extend it). App source: `@/...`; app test helpers:
`@tests/...` (app tests only). Everything else: `@kobato/<package>/...`. No relative specifiers in source or tests —
exceptions: React Router generated `./+types/*`, the SEA build-output entry, generated probe JavaScript, and
import-scanner test fixtures.

- Source never imports a package's `tests/` tree; the one sanctioned cross-package seam is
  `@kobato/<owner>/tests/utils/<name>` — the canonical fixture registry lives in `tools/test/AGENTS.md`.
- Inkling internals: `@kobato/inkling-internal/...` is private to `packages/inkling/`. Public consumers use
  `@kobato/inkling`, `/headless*`, `/host-cards`, or `/styles/*`; the demo uses `@kobato/inkling-demo/...`.

## Layering

Dependency declarations are the enforcement; the graphs are pinned by the arch tests in `apps/kobato/tests/arch/`. This
section pins the direction graph only — package composition rules live in each package's own `AGENTS.md`.

- `packages/shared/*` leaves are the dependency floor (the leaf DAG lives in `packages/shared/AGENTS.md`).
- `@kobato/api` → the shared leaves only.
- `@kobato/server` → `db`, `api`, the shared leaves, and Inkling only via `/headless`; never web or `ui` in `src/`.
- `@kobato/db` → `settings`, `utils`, inkling headless; it owns every query, transaction, native connection, and row
  model, never wire shapes.
- Web direction is one-way: `web-admin` → `web-public` / `web-client`, `web-public` → `web-client`. Web leaves never
  import `@kobato/server` (admin allows it tests-only). The browser oRPC client is typed exclusively through
  `@kobato/api`.
- `@kobato/ui` → `settings`, `i18n`, `utils`. `@kobato/inkling` → `ui`, `i18n`, `distribution`, `assets`, `utils`.
- `apps/kobato/src/routes/*` wire only: extract request context, call orchestrators, render.
- Refactor from architectural correctness, not minimal diff size.

## Skills

`.agents/skills/` overrides these conventions on conflict. Repo-owned skills (`release`) live there directly; synced
skills are pinned in `skills-lock.json`.

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
- Pool/isolation: every project spreads `vitestTestBase` from `@kobato/test/vitest.base.ts` — `isolate: true`, so
  `vi.mock` holders, product global state, and native engines get a fresh module registry per file (no mock-file
  scanning, no shared/isolated split). Pool defaults and the DOM-project overrides live in `tools/test/AGENTS.md`.
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
- Preserve public URLs, feed URLs, image endpoints, WordPress compatibility routes, and pagination routes.
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
  `"workspace:*"`.
- Only native-dynamic-library packages required at production runtime belong in the ROOT `package.json` `dependencies`:
  `@napi-rs/canvas`, `sharp`, `@duckdb/node-api`, `@kobato/font-split` (workspace addon, `nativeRequire`-only).
  Everything else is a devDependencies entry of the importing package — the SEA binary builds from the full dev install.
- Engine-upgrade protocol (drizzle-orm/kit pairing, `.mapWith(Number)` on raw integer `sql` fields, the DuckDB 2.0 peer
  exception) lives in `packages/db/AGENTS.md`.
