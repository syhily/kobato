# Project conventions

## Quick orientation

- pnpm monorepo. The deployable app is `apps/kobato` (React Router 8 Framework Mode with SSR, `appDirectory: 'src'`, React 19 TSX/TS only); reusable code lives in workspace packages under `packages/`; path alias `@/*` → `./apps/kobato/src/*` (app-internal only).
- Product packages: `@kobato/server` (`packages/server` — backend domains, HTTP, SSR, infrastructure adapters), `@kobato/db` (`packages/db` — SQLite node:sqlite/Drizzle and DuckDB engines, persistence schemas, operations, and migrations), `@kobato/web` (`packages/web` — product frontend: a lower browser-platform `client/` — oRPC client, document-level hooks, the root settings provider, the cross-surface editor platform — composed by product components and domain controllers in `ui/`; page/comment editor composition lives in `ui/`), `@kobato/ui` (`packages/ui` — design tokens, base styles, primitives, icons, theme/i18n providers), `@kobato/inkling` (`packages/inkling` — the self-contained Lexical editor layer). DuckDB persistence lives in `@kobato/db/duckdb`; the server owns engine composition, process batchers/schedulers, and telemetry.
- The former single `@kobato/shared` package is now a nine-package isomorphic umbrella under `packages/shared/*` (directory `packages/shared/<name>`, specifier `@kobato/<name>`): `@kobato/utils` (pure helpers, the display `format` facade, `version`), `@kobato/i18n` (locale contract, ICU message catalogs, Inkling label tables), `@kobato/cache` (the cache-bucket declaration registry and its derived id unions — NOT the server storage plane), `@kobato/settings` (settings sections/projection/snapshot, `app-localization`, representation-scope generations, RUM client identity), `@kobato/assets` (the site-owned asset-URL grammar, image kinds/URLs, font payloads), `@kobato/lexical` (the Lexical document model: storage schemas, save pipeline, host-card specs, and their Tailwind source partial), `@kobato/sanitize` (the isomorphic DOMPurify stack plus `sanitize-url`), `@kobato/contracts` (wire Zod schemas/DTOs, `api-error`, `merge-patch`, SEA asset keys, warmup constants), `@kobato/seo` (`meta`/`og-image` builders). All nine are runtime-isomorphic and React-free; umbrella rules live in `packages/shared/AGENTS.md`, each leaf has its own AGENTS.md.
- `packages/tools/` is the umbrella for development-support packages — nothing under it ships in the product: `@kobato/config` (`packages/tools/config` — shared TypeScript/oxlint/oxfmt configuration), `@kobato/test` (`packages/tools/test` — test-only utilities), `@kobato/trace` (`packages/tools/trace` — the OpenObserve DEV container tooling), `@kobato/browser` (`packages/tools/browser` — the real-browser Playwright journey runner, `test:browser` / `sea:browser`), `@kobato/email` (`packages/tools/email` — localized email-template previews, `emails:generate`), `@kobato/i18n-tools` (`packages/tools/i18n` — regional terminology diff report, `i18n:regional-diff`), `@kobato/pack` (`packages/tools/pack` — packaging tooling: SEA pipeline `src/sea/`, release automation `src/release.ts`). Beyond `packages/`: `apps/inkling-demo` (the standalone inkling playground, `pnpm demo`) and `scripts/` — standalone ops scripts that import nothing from the project (shell or node-builtins only; currently just `build-deb.sh` + `deb/` packaging). Anything that needs project modules belongs in a tools package, not in `scripts/`.
- Imports are module-root anchored: `@kobato/<package>/...` across and within product packages, `@/...` within the app. React Router's generated `./+types/*` imports are the exception. Inkling keeps its closed public entry surfaces and internal relative imports. Package dependency declarations enforce layering physically — an undeclared cross-package import fails typecheck, not just review.
- Tailwind source ownership is package-local with one compile per surface. UI's `ui.css` and Inkling's `styles/index.css` are standalone entries; web `styles/{public,admin}.css` and the lexical cards' `styles/cards.css` are package-owned `@source` partials. Each consuming surface (the app's `styles/admin.css` / `styles/public.css`, the demo's `styles/public.css`) runs exactly one Tailwind compile composing those partials via CSS `@import` behind the UI token reference, with UI's `ui.css` first as the eager root document entry. Source partials carry no `@import 'tailwindcss'` or top-level cascade-layer order declaration, and never re-declare the UI-owned `dark` variant; never use cross-package `@source` or import partials from components/routes. `apps/kobato/tests/arch/tailwind-source-ownership.test.ts` enforces the rule.
- `pnpm dev` / `pnpm start` run the process with cwd at the REPOSITORY ROOT (vite root stays `apps/kobato` via `react-router dev apps/kobato`), so the runtime's cwd-anchored paths (`kobato.config.json`, `./data`) resolve exactly as a deployed binary expects. Build-time code must anchor paths on `import.meta.url`, never on `process.cwd()`; `@kobato/db` resolves its package-owned migrations the same way outside SEA.
- Distribution is a single Node.js executable (SEA); runtime infrastructure config is `kobato.config.json`, validated through `CONFIG_TABLE`. `apps/kobato/package.json` is the version source of truth, and every workspace package carries the same fixed version (the root `package.json` stays a version-less workspace manifest). `release:bump` and `release:prepare-next` synchronize every package; `pnpm version:sync <version>` repairs drift manually.
- Observability (traces/metrics/logs/browser RUM) is configured only in the admin `observability` settings section and provisioned by the server; browser RUM relays through the same-origin `/api/rum/intake` endpoint so the OpenObserve address is never exposed to visitors; `packages/tools/trace/src/` is optional DEV container tooling (retention + smoke).

## Subdirectory conventions

Agents load these additively as they move through the codebase:

Package-level conventions live at each workspace package root (`packages/<package>/AGENTS.md`). Nested `src/**/AGENTS.md` files are reserved for large internal modules such as server infra/domains and web client/ui.

- `apps/kobato/src/routes/AGENTS.md` route modules, loaders, actions, React Router conventions; `packages/server/AGENTS.md` server layers, API procedures, auth, databases, content; `packages/db/AGENTS.md` SQLite/Drizzle and DuckDB persistence ownership; `packages/db/drizzle/AGENTS.md` migration authoring; `packages/server/src/infra/AGENTS.md` config file contract, SEA runtime rules; `packages/server/src/domains/storage/AGENTS.md` S3 config locking, storage migration, asset URLs.
- `packages/server/src/domains/backup/AGENTS.md` backup archive, encryption, restore; `packages/web/AGENTS.md` product-frontend ownership; `packages/web/src/client/AGENTS.md` browser platform: document-level hooks, oRPC client, editor platform, React.lazy patterns; `packages/web/src/ui/AGENTS.md` product components, domain controllers, editor composition, the body projection renderer, component architecture; `packages/web/src/ui/admin/settings/AGENTS.md` settings autosave model, card wrappers.
- `packages/ui/AGENTS.md` design-system ownership; `apps/kobato/src/styles/AGENTS.md` app-owned Tailwind entries and product scan graphs; `packages/web/src/styles/AGENTS.md` Inkling host-style adapters; `packages/ui/src/styles/AGENTS.md` generic Tailwind tokens, typeset CSS, and `@theme` conventions; `packages/shared/AGENTS.md` the shared umbrella rules plus the nine leaf packages (`packages/shared/<pkg>/AGENTS.md` per leaf); `packages/inkling/AGENTS.md` the Lexical editor layer: card pipeline, headless surface, labels.
- Per-module test conventions live next to the tests: `apps/kobato/tests/AGENTS.md` (app projects, arch guards, duckdb, e2e, browser journeys), `packages/{db,server,ui,web,inkling}/tests/AGENTS.md`, `packages/shared/tests/AGENTS.md` (the umbrella `shared-unit`/`shared-snaps` roots over the nine leaf test trees), `packages/tools/test/AGENTS.md` (the `@kobato/test` utilities catalog and DB/DuckDB harness); `packages/tools/pack/src/sea/AGENTS.md` SEA packaging, build/smoke/probe/e2e, self-update; `packages/tools/trace/README.md` optional OpenObserve DEV container, dev retention, privacy assets, smoke.

## Skills

Agent Skills under `.agents/skills/` override these conventions on conflict; `drizzle` and `taze` are CLI-generated gitignored symlinks into `node_modules` (not repo-owned); `.claude/skills/` mirrors repo-owned skills for Claude Code via symlink.

- `react-router-framework-mode` — routes, loaders, actions, forms, navigation, `react-router.config.ts`.
- `vercel-react-best-practices` — any React/SSR code; the 70 numbered rules are the performance baseline.
- `vercel-geist-design-system` — Geist/Vercel-inspired UI: typography, spacing, color, app shells.

## Build & CI

- `pnpm run dev`, `pnpm run fmt`, `pnpm run lint`, `pnpm run type`, `pnpm run test`, `pnpm run build`
- Before committing: `pnpm run fmt && pnpm run lint && pnpm run type`, `pnpm run test`, `pnpm run build`

## Test conventions

Tests live next to the package they cover — there is no root-level test tree. Universal rules:

- **Single-purpose rule.** One test file must not mix purposes; split unit (pure logic, mocks only) from integration (hits DB / real RPC) before moving: unit → `<package>/tests/unit/<mirrored-path>.test.ts`, integration → `<package>/tests/it/`, snapshots → `<package>/tests/snaps/`.
- Import `describe`, `it`, `expect`, `vi` from `vitest`. Run a single project with `npx vitest run --project <name>` (filters are relative to the project root, e.g. `npx vitest run --project app-unit arch/`).
- **TypeScript pragmatism.** Test code verifies behavior, not perfect types: `any`, `as`, and `ts-expect-error` are acceptable escapes for intentionally partial mocks/fixtures; prefer the narrowest escape, reach for `any` only after `as` proves too verbose.
- Tests import production code through the same package-root specifiers as production code (`@kobato/server/...`, `@kobato/db/...`, `@kobato/ui/...`); test-local helpers may stay relative. `@/*` is app-source only. Filesystem-anchored guards resolve against the repository root (`process.cwd()` when run via the root `pnpm run test`).

## Git

- Semantic commits in English: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:` — imperative mood, lowercase subject, no trailing period. Do not create commits unless explicitly asked.

## Release workflow

Use `/release <version> <next-version>` (e.g., `/release 6.3.0 6.4.0-dev`). No PRs — direct fast-forward merge from develop to main. Version is baked at build time via `vite.config.ts` `define.__APP_VERSION__`.

1. Analyze commits since last tag and draft AI-generated release notes; bump all workspace packages to `<version>`, push develop, fast-forward merge to main, push main.
2. Create git tag + GitHub release (the SEA workflow triggers automatically); switch back to develop, prepare `<next-version>`, push.

## Defensive constraints

Banned layer-root directories (in any package): `actions/`, `middleware/`, `layouts/`, `services/`, `hooks/`, `db/`, `content/` at a source root, and `assets/scripts/`. There is no `assets/scripts/`; all interactivity lives in React hooks/components under `packages/web/src/client/` and `packages/web/src/ui/`.

- `apps/kobato/src/blog.config.ts`, `DEFAULT_SETTINGS`, `BlogConstants`, the per-section "reset to defaults" action, and a monolithic `BlogConfigContext`/`<BlogConfigProvider>` — use per-section hooks.
- `data-admin-shell` selector; a `packages/web/src/lib/` parallel to `packages/ui/src/lib`; `@kobato/web/ui/admin/shadcn/components/ui/` nesting.
- Preserve public URLs, feed URLs, image endpoints, WordPress compatibility routes, and pagination routes.
- `*.server.ts` suffix is redundant inside `packages/server/src/`.
- Streamed loader promises (a loader returning an un-awaited promise) require the process-level `unhandledRejection` handler in `packages/server/src/infra/lifecycle.ts` — do not remove it.
- Never wrap the whole app (or any SSR-critical DOM that must match between server and client) in a lazy `<Suspense>` boundary whose fallback differs from the resolved content — on a cold visit the chunk is still loading at hydration time and the whole tree mismatches (React error #418). The root `LazyMotionConfig` imports its provider eagerly so a late chunk cannot replace the app tree and reset its state; other SSR-critical DOM uses a hydration-safe `useSyncExternalStore` gate or an eager import.
- Hydration-enhancement mount points in the projected `body_html` follow the same rule: the static fallback must mirror the enhanced component's initial render (the music-player card's `musicPlayerFallbackHtml` ⇔ `MusicPlayerCard` paused state, parity-pinned by `packages/web/tests/unit/ui/public/music-player/music-player.test.tsx`).
- JS-driven animation goes only through the `@kobato/ui/components/lazy-motion` facade (`LazyMotion*` / `LazyAnimatePresence` / `LazyMotionConfig`, or the `EagerMotion*` / `EagerAnimatePresence` browser-only nodes) — never a direct runtime `motion/react` import outside that module. Shared easing/duration constants live in `@kobato/web/client/lib/motion`; simple hover/state styling stays on CSS `transition-*` utilities.
- Never use React `<ViewTransition>` / `addTransitionType` / `document.startViewTransition` for element or navigation animation — named captures paint in the `::view-transition` overlay above every z-index; the theme-switch wipe in `packages/ui/src/lib/ThemeProvider.tsx` is the sole `startViewTransition` consumer.

## Dependencies

- Every version number lives in the root `pnpm-workspace.yaml` `catalog:` table (every `package.json` references entries as `"catalog:"`); `taze` edits the catalog in place. Version-exact pins (the drizzle rc pair) stay exact inside the catalog — taze treats range-less entries as locked and skips them; every other entry carries a `^` range so `pnpm bump` keeps it current.
- Each package declares every external package it imports — the declarations are the layering enforcement, so an undeclared import fails typecheck. Workspace links go in `dependencies`/`devDependencies` as `"workspace:*"` (a package's self-link lives in its own devDependencies).
- Only packages required at production runtime AND shipping a native dynamic library belong in the ROOT `package.json`'s `dependencies`: `@napi-rs/canvas` and `sharp` (per-platform binaries), `@duckdb/node-api` (`duckdb.node` + libduckdb per platform).
- Every other dependency belongs in `devDependencies` (of the package that imports it), even if the server or client bundle imports it in production: `react`, `hono`, `drizzle-orm`, `nodemailer`, `feed`, `pg`, `bcryptjs`, `dompurify`, `fast-xml-parser`.
- Distribution ships only the SEA binary built on CI with the full dev install (see `packages/tools/pack/src/sea/AGENTS.md`): no node runtime, no node_modules, no `pnpm install --prod` step. Native packages must stay in the root `dependencies` so the build installs their platform binaries; the SEA pipeline bundles their JS and embeds the platform `.node` / libvips library files (`packages/tools/pack/src/sea/assets.ts`).
- `drizzle-orm` / `drizzle-kit` stay pinned at `1.0.0-rc.5` (pre-release); when drizzle 1.0 stable ships, evaluate upgrading the pair together and re-run the migration contract tests before unpinning.

## Layering

Package dependency declarations enforce these rules physically; `apps/kobato/tests/arch/package-dag.test.ts` pins the exceptions and the full SRC DAG.

- The shared umbrella (`packages/shared/*`, all runtime-isomorphic, React-free): `@kobato/i18n`, `@kobato/assets`, `@kobato/sanitize` are leaves (i18n's only edge is a tests-only inkling pin); `@kobato/utils` → i18n; `@kobato/cache` → i18n, utils; `@kobato/lexical` → `@kobato/inkling/headless`, assets, sanitize, utils; `@kobato/settings` → i18n, cache, utils (NEVER contracts — contracts imports settings, not the reverse); `@kobato/contracts` → settings, i18n, utils, lexical, assets, cache; `@kobato/seo` → settings, i18n, utils.
- `@kobato/server` (`packages/server`) → `@kobato/db`, all nine shared leaves, `@kobato/inkling` only through `@kobato/inkling/headless`. Never `@kobato/web` or `@kobato/ui` in `src/` (the declared web edge exists for test fixtures only).
- `@kobato/db` (`packages/db`) → `@kobato/contracts`, `@kobato/settings`, `@kobato/lexical`, `@kobato/utils`. Owns SQLite/Drizzle and DuckDB persistence; never server, web, or UI.
- `@kobato/web` (`packages/web`) → `@kobato/ui`, the shared leaves EXCEPT `@kobato/seo`, `@kobato/inkling` (barrel). Never value-imports `@kobato/server` — the single sanctioned channel is the type-only `RouterClient<ApiRouter>` in `packages/web/src/client/api/client.ts`; every other shared shape comes from `@kobato/contracts`.
- `@kobato/ui` (`packages/ui`) → `@kobato/settings`, `@kobato/i18n`, `@kobato/utils`. Browser/SSR-safe design system; never web or server.
- `@kobato/config` (`packages/tools/config`) owns shared tool configuration and has no product-package dependency.
- `@kobato/inkling` (`packages/inkling`) → itself only (host-agnostic editor island; imports no `@kobato/*` package at all — its lexical edge is tests-only fixtures). The rest of the app imports it ONLY through two entry surfaces: `@kobato/inkling` (the React barrel — app routes and web) and `@kobato/inkling/headless` (react-free; the ONLY surface `@kobato/server` and `@kobato/lexical` may use). Pinned by the package-dag test.
- `apps/kobato/src/routes/*` wire only: extract request context, call orchestrators, render. No DB imports or business logic inline.
- Cross-domain imports under `packages/server/src/domains/` must stay acyclic; `apps/kobato/tests/arch/server-layers.test.ts` pins the internal layer direction, the audited render seams, and the complete cross-domain edge set.
- No barrel `index.ts` files. No `export { X } from 'y'` re-exports — import directly from the source module (`packages/inkling/` is the deliberate exception: its barrel IS the public surface). Refactor from architectural correctness, not minimal diff size.
