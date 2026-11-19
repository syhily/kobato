# Project conventions

## Workspace

pnpm monorepo with four top-level roots; nothing else is created at the root:

- `apps/` — deployable apps: `kobato` (React Router 8 Framework Mode, SSR, React 19 TSX/TS, `appDirectory: 'src'`) and `inkling-demo` (standalone Inkling playground, `pnpm demo`).
- `packages/` — product code that ships: `@kobato/server` (backend domains, HTTP, SSR, infra), `@kobato/db` (SQLite node:sqlite/Drizzle + DuckDB persistence), `@kobato/api` (oRPC contract-first layer over `@kobato/contracts`), `@kobato/ui` (design system), `@kobato/inkling` (kobato's Lexical editor: React editor runtime, the React-free document model under `src/headless/`, and the kobato host-card assemblies under `src/host-cards/`), `packages/web/*` (`web-client` the browser platform leaf, `web-public` the public frontend, `web-admin` the admin frontend), and twelve isomorphic React-free leaves under `packages/shared/*`: utils, auth, i18n, cache, catalog, settings, assets, sanitize, contracts, telemetry, distribution, seo.
- `tools/` — dev-support packages (`toolchain`, `test`, `harness`, `browser`, `email`, `i18n-tools`, `trace`, `pack`); nothing here ships in the product binary, and product `src/` never imports a tools package.
- `scripts/` — standalone ops scripts importing no project module (shell / Node builtins only); anything needing project modules belongs in `tools/`.

Every product package (`apps/` + `packages/`) has the same shape — `package.json`, `AGENTS.md` (required), `src/` (runtime source only), `tests/` mirroring `src/`, plus `drizzle/` (db only) or `assets|styles/` when the package owns them. `tools/` packages carry `package.json`, `AGENTS.md`, and `src/`, with `tests/` optional; `apps/inkling-demo` is the standalone playground. Config files (`vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `drizzle.config.ts`) live at the package root. Test-only binaries belong to the consuming package's `tests/fixtures/`; `src/` holds no build output or generated reports.

Naming (pinned by `apps/kobato/tests/arch/structure-conventions.test.ts`): `kebab-case.ts` modules, `PascalCase.tsx` components, `use-kebab-case.ts(x)` hooks, `kebab-case-context.tsx` contexts, `*.controller.ts` controllers. Entity directories and wire modules are plural (`posts`, `comments`); mass nouns stay singular (`content`, `music`, `settings`, `cache`). No `index.ts` barrels and no `export { X } from 'y'` re-exports — `packages/inkling`'s public barrel is the one exception. Create a directory only for a family of three or more sibling modules or a documented layer.

Runtime facts:

- `pnpm dev` / `pnpm start` run with cwd at the repository root so cwd-anchored paths (`kobato.config.json`, `./data`) resolve as a deployed binary expects; build-time code anchors paths on `import.meta.url`, never on `process.cwd()`.
- Distribution is a single SEA executable; runtime config is `kobato.config.json`, validated through `CONFIG_TABLE`. `apps/kobato/package.json` is the version source of truth — every package carries the same version, synchronized by `release:bump` / `release:prepare-next` (`pnpm version:sync <version>` repairs drift).
- Tailwind: package-owned `@source` partials, exactly one compile per surface (app `styles/admin.css` / `styles/public.css`, demo `styles/public.css`) composing them via CSS `@import` behind the UI token root (`ui.css` first). Partials carry no `@import 'tailwindcss'`, no layer-order declaration, never re-declare the UI-owned `dark` variant; no cross-package `@source`. Pinned by `apps/kobato/tests/arch/tailwind-source-ownership.test.ts`.

## Documentation

- The root `README.md` is the repository's only README; every other directory documents itself in `AGENTS.md`.
- A package's substantive conventions live in its package-root `AGENTS.md`; nested `src/**/AGENTS.md` and `tests/AGENTS.md` stay reserved for large internal layers (server `infra/`/`domains/`, web-admin `ui/`, styles entries, migrations). Nested docs load additively as agents move through the codebase.
- Keep every AGENTS.md lean: contract, invariants, enforcing commands. No marketing prose, no restating what code or tests already pin.

## Import conventions

All imports are absolute. The single workspace path table is `@kobato/toolchain/tsconfig.base.json`; root and demo tsconfigs only extend it — never add a package-level `paths` table.

- App source: `@/...` → `apps/kobato/src/...`; app test helpers: `@tests/...` → `apps/kobato/tests/...` (app tests only).
- Everything else: `@kobato/<package>/...`. Source never imports a package's `tests/` tree; package-local test helpers use `@kobato/<package>/tests/...` only from that package's own tests.
- Inkling internals: `@kobato/inkling-internal/...`, private to `packages/inkling/` plus its one white-box parity test. Public consumers use `@kobato/inkling`, `@kobato/inkling/headless*` (entry or per-file), `@kobato/inkling/host-cards`, or `@kobato/inkling/styles/*`; the demo uses `@kobato/inkling-demo/...`.

No relative specifiers in source or tests. Exceptions: React Router generated `./+types/*`, the SEA build-output entry (`tools/pack/src/sea/server-entry.ts`) and generated probe JavaScript, and import-scanner tests quoting specifiers as fixtures. Build-time configs import through package specifiers like everything else (e.g. `@kobato/pack/sea/*`, `@kobato/test/*`). `apps/kobato/tests/arch/package-dag.test.ts` enforces the single path table, alias confinement, and the no-relative rule.

## Layering

Dependency declarations are the physical enforcement. `apps/kobato/tests/arch/package-dag.test.ts` pins the full SRC DAG and exceptions, `web-direction.test.ts` the web seams, `server-layers.test.ts` the internal server graph, `admin-feature-graph.test.ts` the intra-`web-admin` feature graph, and `server-public-surface.test.ts` the server's externally consumable module surface (domain `repos/**` privacy included). `module-cycles.test.ts` keeps every product src tree free of module-level value-import cycles.

- `packages/shared/*`: runtime-isomorphic, React-free. `@kobato/settings` never imports `@kobato/contracts` (contracts imports settings). `@kobato/catalog` and `@kobato/contracts` reach the Lexical document model through `@kobato/inkling/headless` (catalog type-only).
- `@kobato/api` → `@kobato/contracts` only; metadata-only (`method`/`path`/`input`/`output`). The server implements contracts through the `implement{Public,Authed,Author,Admin}` bases in `packages/server/src/http/orpc-base.ts`.
- `@kobato/server` → `db`, `api`, the shared leaves, and Inkling only via `/headless`; never web or `ui` in `src/`.
- `@kobato/db` → `settings`, `utils`, and inkling headless (the comment document schema); owns its local row/query models, never wire shapes.
- Web direction is one-way: `web-admin` → `web-public` / `web-client`, `web-public` → `web-client`; never the reverse. Web leaves never import `@kobato/server` (admin allows it only as a tests-only fixture dependency). The browser oRPC client is typed exclusively through `@kobato/api`.
- `@kobato/ui` → `settings`, `i18n`, `utils`; it also owns the product-level `components/music-player/` family (public-site hydration + editor preview). `@kobato/inkling` → `ui`, `sanitize`, `assets`, `utils` — the editor fully serves kobato (no external-reuse island invariant); the document model it owns ships React-free under `/headless`, and consumers reach the editor only via the barrel, `@kobato/inkling/headless*`, `@kobato/inkling/host-cards`, or `/styles/*`.
- `apps/kobato/src/routes/*` wire only: extract request context, call orchestrators, render — no DB imports or business logic inline. Cross-domain imports under `packages/server/src/domains/` stay acyclic.
- Refactor from architectural correctness, not minimal diff size.

## Skills

`.agents/skills/` overrides these conventions on conflict; `drizzle` and `taze` are CLI-generated gitignored symlinks, `.claude/skills/` mirrors repo-owned skills for Claude Code.

- `react-router-framework-mode` — routes, loaders, actions, `react-router.config.ts`.
- `vercel-react-best-practices` — the React/SSR performance baseline.
- `vercel-geist-design-system` — Geist UI conventions.

## Build & CI

- `pnpm run dev`, `pnpm run fmt`, `pnpm run lint`, `pnpm run type`, `pnpm run test`, `pnpm run build`.
- Before committing: `pnpm run fmt && pnpm run lint && pnpm run type`, then `pnpm run test`, `pnpm run build`.

## Tests

Tests live next to the covered package — no root-level test tree.

- **Single-purpose rule:** unit (pure logic, mocks) → `tests/unit/<mirrored-path>.test.ts`; integration (DB / real RPC) → `tests/it/`; snapshots → `tests/snaps/`. One file never mixes purposes.
- Import `describe`, `it`, `expect`, `vi` from `vitest`; run one project with `npx vitest run --project <name>`.
- Tests import production code through the same package-root specifiers as production code; test-local helpers may stay relative.
- **TypeScript pragmatism:** `any`, `as`, `ts-expect-error` are acceptable escapes for intentionally partial mocks; prefer the narrowest escape.

## Git

- Semantic commits in English (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`), imperative mood, lowercase subject, no trailing period. Do not create commits unless explicitly asked.

## Release

Use `/release <version> <next-version>` (e.g. `/release 6.3.0 6.4.0-dev`) — the skill automates the full lifecycle. No PRs: direct fast-forward merge develop → main. Version is baked at build time via `vite.config.ts` `define.__APP_VERSION__`.

## Defensive constraints

- Banned layer-root directories in any package: `actions/`, `middleware/`, `layouts/`, `services/`, `hooks/`, `db/`, `content/`, `assets/scripts/`. Sole exception: Inkling's `src/hooks/` and `src/services/` are real editor-island layers.
- No `apps/kobato/src/blog.config.ts`, `DEFAULT_SETTINGS`, `BlogConstants`, per-section "reset to defaults" actions, or a monolithic `BlogConfigContext` — use per-section hooks.
- No `data-admin-shell` selector, no `packages/web/admin/src/lib/` parallel to `packages/ui/src/lib`, no `@kobato/web-admin/ui/shadcn/components/ui/` nesting.
- Preserve public URLs, feed URLs, image endpoints, WordPress compatibility routes, and pagination routes.
- `*.server.ts` is redundant inside `packages/server/src/`.
- Do not remove the process-level `unhandledRejection` handler in `packages/server/src/infra/lifecycle.ts` — streamed loader promises require it.
- Never wrap SSR-critical DOM in a lazy `<Suspense>` whose fallback differs from the resolved content — on a cold visit the chunk is still loading at hydration time and the whole tree mismatches (React error #418). The root `LazyMotionConfig` imports its provider eagerly; other SSR-critical DOM uses a hydration-safe `useSyncExternalStore` gate or an eager import. The same rule covers hydration mount points in projected `body_html`: the static fallback must mirror the enhanced component's initial render (`musicPlayerFallbackHtml` ⇔ `MusicPlayerCard` paused, parity-pinned by test).
- JS-driven animation goes only through the `@kobato/ui/components/lazy-motion` facade — never a direct runtime `motion/react` import. Simple hover/state styling stays on CSS `transition-*` utilities.
- Never use React `<ViewTransition>` / `addTransitionType` / `document.startViewTransition` for element or navigation animation — named captures paint in the `::view-transition` overlay above every z-index. The theme-switch wipe in `packages/ui/src/lib/ThemeProvider.tsx` is the sole `startViewTransition` consumer.

## Dependencies

- Every version lives in the root `pnpm-workspace.yaml` `catalog:` table; `taze` edits it in place. Range-less entries (the drizzle rc pair) are locked; every other entry carries `^`.
- Each package declares every external package it imports — the declarations are the layering enforcement, so an undeclared import fails typecheck. Workspace links are `"workspace:*"` (a package's self-link lives in its own devDependencies).
- Only native-dynamic-library packages required at production runtime belong in the ROOT `package.json` `dependencies`: `@napi-rs/canvas`, `sharp`, `@duckdb/node-api`. Every other dependency — even production-bundled ones like `react`, `hono`, `drizzle-orm` — is a `devDependencies` entry of the importing package: the SEA binary is built on CI from the full dev install (see `tools/pack/AGENTS.md`).
- `drizzle-orm` / `drizzle-kit` stay pinned at `1.0.0-rc.5`; when drizzle 1.0 stable ships, upgrade the pair together and re-run the migration contract tests before unpinning.
