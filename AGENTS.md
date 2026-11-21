# Project conventions

## Workspace

pnpm monorepo with four top-level roots; nothing else is created at the root:

- `apps/` — deployable apps: `kobato` (React Router 8 Framework Mode, SSR, React 19, `appDirectory: 'src'`) and `inkling-demo` (standalone Inkling playground, `pnpm demo`).
- `packages/` — product code that ships: `@kobato/server` (backend domains, HTTP, SSR, infra), `@kobato/db` (SQLite node:sqlite/Drizzle + DuckDB persistence), `@kobato/api` (oRPC contract layer over `@kobato/contracts`), `@kobato/ui` (design system), `@kobato/inkling` (Lexical editor: React runtime, React-free `/headless/` document model, `/host-cards/` assemblies), `packages/web/*` (`web-client` browser platform, `web-public` public frontend, `web-admin` admin frontend), and twelve isomorphic React-free leaves under `packages/shared/*`.
- `tools/` — dev-support packages (`toolchain`, `test`, `harness`, `browser`, `email`, `i18n-tools`, `trace`, `pack`); nothing ships in the product binary, and product `src/` never imports a tools package.
- `scripts/` — standalone ops scripts (shell / Node builtins only); anything needing project modules belongs in `tools/`.

Every product package (`apps/` + `packages/`) has the same shape — `package.json`, `AGENTS.md` (required), `src/` (runtime source only), `tests/` mirroring `src/`, plus `drizzle/` (db) or `assets|styles/` when owned. Config files (`vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `drizzle.config.ts`) live at the package root. `tools/` packages carry `package.json`, `AGENTS.md`, `src/`, with `tests/` optional.

Naming (pinned by `apps/kobato/tests/arch/structure-conventions.test.ts`): `kebab-case.ts` modules, `PascalCase.tsx` components, `use-kebab-case.ts(x)` hooks, `kebab-case-context.tsx` contexts, `*.controller.ts` controllers. Entity directories and wire modules plural (`posts`, `comments`); mass nouns singular (`content`, `music`, `settings`, `cache`). No `index.ts` barrels and no `export { X } from 'y'` re-exports — `packages/inkling`'s public barrel is the one exception. A new directory needs three or more sibling modules or a documented layer.

Runtime facts:

- `pnpm dev` / `pnpm start` run with cwd at the repository root (cwd-anchored `kobato.config.json` / `./data`); build-time code anchors paths on `import.meta.url`, never `process.cwd()`.
- Distribution is a single SEA executable; runtime config is `kobato.config.json`, validated through `CONFIG_TABLE`. `apps/kobato/package.json` is the version source of truth — every package carries the same version (`pnpm version:sync <version>` repairs drift).
- Tailwind: package-owned `@source` partials, exactly one compile per surface (`styles/admin.css` / `styles/public.css`) composing them via CSS `@import` behind the UI token root (`ui.css` first). Partials carry no `@import 'tailwindcss'`, no layer-order declaration, never re-declare the UI-owned `dark` variant, no cross-package `@source`. Pinned by `apps/kobato/tests/arch/tailwind-source-ownership.test.ts`.

## Documentation

- The root `README.md` is the repository's only README; every other directory documents itself in `AGENTS.md`.
- Substantive conventions live in the package-root `AGENTS.md`; nested `src/**/AGENTS.md` is reserved for large internal layers (server `infra/`/`domains/`, web-admin `ui/`, styles, migrations). Docs load additively.
- Keep every AGENTS.md lean: contract, invariants, enforcing commands. No restating what code or tests already pin.

## Import conventions

All imports are absolute and module specifiers omit `.ts`/`.tsx`; the single workspace path table is `@kobato/toolchain/tsconfig.base.json` (consumer tsconfigs only extend it — no package-level `paths`). Workspace export wildcards carry `.ts`/`.tsx` fallback targets so the same specifiers also resolve under native Node.

- App source: `@/...`; app test helpers: `@tests/...` (app tests only).
- Everything else: `@kobato/<package>/...`. Source never imports a package's `tests/` tree; test trees stay in their own package except the canonical shared fixtures — cross-package `@kobato/<owner>/tests/utils/<name>` imports (settings blog-settings, i18n translator, contracts content, inkling lexical, web-client render) are the sanctioned seam, pinned by `apps/kobato/tests/arch/package-dag.test.ts`.
- Inkling internals: `@kobato/inkling-internal/...`, private to `packages/inkling/` plus its one white-box parity test. Public consumers use `@kobato/inkling`, `/headless*`, `/host-cards`, or `/styles/*`; the demo uses `@kobato/inkling-demo/...`.

No relative specifiers in source or tests. Exceptions: React Router generated `./+types/*`, the SEA build-output entry, generated probe JavaScript, import-scanner test fixtures, and the root Vitest config's inline-project definition imports. Other build-time configs import through package specifiers. `apps/kobato/tests/arch/package-dag.test.ts` enforces the table, alias confinement, and the no-relative rule.

## Layering

Dependency declarations are the enforcement; the arch tests under `apps/kobato/tests/arch/` pin the graphs: `package-dag`, `web-direction`, `server-layers`, `admin-feature-graph`, `server-public-surface`, `module-cycles`.

- `packages/shared/*`: runtime-isomorphic, React-free. `@kobato/settings` never imports `@kobato/contracts`. `catalog` and `contracts` reach the Lexical document model only via `@kobato/inkling/headless` (catalog type-only).
- `@kobato/api` → `@kobato/contracts` only; metadata-only (`method`/`path`/`input`/`output`). The server implements contracts through the `implement{Public,Authed,Author,Admin}` bases in `packages/server/src/http/orpc-base.ts`.
- `@kobato/server` → `db`, `api`, the shared leaves, and Inkling only via `/headless`; never web or `ui` in `src/`.
- `@kobato/db` → `settings`, `utils`, inkling headless; owns row/query models, never wire shapes.
- Web direction is one-way: `web-admin` → `web-public` / `web-client`, `web-public` → `web-client`. Web leaves never import `@kobato/server` (admin allows it tests-only). The browser oRPC client is typed exclusively through `@kobato/api`.
- `@kobato/ui` → `settings`, `i18n`, `utils`, plus the `components/music-player/` family. `@kobato/inkling` → `ui`, `sanitize`, `assets`, `utils`; its document model ships React-free under `/headless`.
- `apps/kobato/src/routes/*` wire only: extract request context, call orchestrators, render — no DB imports or business logic inline. Cross-domain imports under `packages/server/src/domains/` stay acyclic.
- Refactor from architectural correctness, not minimal diff size.

## Skills

`.agents/skills/` overrides these conventions on conflict; `drizzle` and `taze` are CLI-generated gitignored symlinks, `.claude/skills/` mirrors repo-owned skills: `react-router-framework-mode`, `vercel-react-best-practices`, `vercel-geist-design-system`, `release`.

## Build & CI

`pnpm run dev`, `pnpm run fmt`, `pnpm run lint`, `pnpm run type`, `pnpm run test`, `pnpm run build`. Before committing: `pnpm run fmt && pnpm run lint && pnpm run type`, then `pnpm run test`, `pnpm run build`.

## Tests

Tests live next to the covered package — no root-level test tree.

- **Single-purpose rule:** unit (pure logic, mocks) → `tests/unit/<mirrored-path>.test.ts`; integration (DB / real RPC) → `tests/it/`; snapshots → `tests/snaps/`. One file never mixes purposes.
- Import `describe`, `it`, `expect`, `vi` from `vitest`; run suites through the root `test*` scripts. Use `pnpm test <path>` for optional path filters; never select Vitest projects on the command line.
- **Pool/isolation:** every project spreads `vitestTestBase` from `@kobato/test/vitest.base.ts` — `pool: 'threads'`, `maxWorkers: 4` (pass `--maxWorkers=<n>` locally for more cores), `isolate: false`. DOM-heavy trees override `pool: 'vmThreads'` (`web-unit`, `web-snaps`, `ui-unit`, `demo-unit`, `inkling-unit`/`inkling-iso-unit`) with a fresh VM context per file. `isolate: true` stays on the iso halves of the merged `app`/`server`/`inkling` trees (`app-iso-unit`, `app-iso-it`, `server-iso-unit`, `server-iso-it`, `inkling-iso-unit` — mock and shared-unsafe files that leak under a shared module registry) and `duckdb` (per-file throwaway database, parallel). `web-tz-unit` runs forks for its runtime `process.env.TZ` write.
- Test hygiene under these pools: no `process.chdir()` (spy on `process.cwd`), no runtime `process.env.TZ` writes outside the forks project, "no browser globals" tests declare `@vitest-environment node`, realm-safe DOM comparisons use identity (`!==`).
- Tests import production code through the same package-root specifiers; test-local helpers may stay relative.
- **TypeScript pragmatism:** `any`, `as`, `ts-expect-error` are acceptable escapes for intentionally partial mocks; prefer the narrowest.

## Git

Semantic commits in English (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`), imperative, lowercase subject, no trailing period. Do not create commits unless explicitly asked.

## Release

`/release <version> <next-version>` — the skill automates the lifecycle. No PRs: direct fast-forward merge develop → main. Version is baked at build time via `vite.config.ts` `define.__APP_VERSION__`.

## Defensive constraints

- Banned layer-root directories in any package: `actions/`, `middleware/`, `layouts/`, `services/`, `hooks/`, `db/`, `content/`, `assets/scripts/`. Sole exception: Inkling's `src/hooks/` and `src/services/`.
- No `apps/kobato/src/blog.config.ts`, `DEFAULT_SETTINGS`, `BlogConstants`, per-section "reset to defaults" actions, or a monolithic `BlogConfigContext` — use per-section hooks.
- No `data-admin-shell` selector, no `packages/web/admin/src/lib/`, no `@kobato/web-admin/ui/shadcn/components/ui/` nesting.
- Preserve public URLs, feed URLs, image endpoints, WordPress compatibility routes, and pagination routes.
- `*.server.ts` is redundant inside `packages/server/src/`.
- Do not remove the process-level `unhandledRejection` handler in `packages/server/src/infra/lifecycle.ts` — streamed loader promises require it.
- Never wrap SSR-critical DOM in a lazy `<Suspense>` whose fallback differs from the resolved content — the tree mismatches at hydration (React #418). The root `LazyMotionConfig` imports eagerly; other SSR-critical DOM uses a hydration-safe `useSyncExternalStore` gate or an eager import. The same rule covers hydration mount points in projected `body_html` (`musicPlayerFallbackHtml` ⇔ `MusicPlayerCard` paused, parity-pinned).
- JS-driven animation goes only through the `@kobato/ui/components/lazy-motion` facade — never a direct runtime `motion/react` import. Simple hover/state styling stays on CSS `transition-*`.
- Never use React `<ViewTransition>` / `addTransitionType` / `document.startViewTransition` for element or navigation animation — named captures paint in the `::view-transition` overlay above every z-index. The theme-switch wipe in `packages/ui/src/lib/ThemeProvider.tsx` is the sole consumer.

## Dependencies

- Every version lives in the root `pnpm-workspace.yaml` `catalog:` table; `taze` edits it in place. Range-less entries are locked; every other entry carries `^`.
- Each package declares every external package it imports — an undeclared import fails typecheck. Workspace links are `"workspace:*"`.
- Only native-dynamic-library packages required at production runtime belong in the ROOT `package.json` `dependencies`: `@napi-rs/canvas`, `sharp`, `@duckdb/node-api`. Everything else is a devDependencies entry of the importing package — the SEA binary builds from the full dev install.
- `drizzle-orm` / `drizzle-kit` stay pinned at `1.0.0-rc.5`; when drizzle 1.0 stable ships, upgrade the pair together and re-run the migration contract tests before unpinning.
