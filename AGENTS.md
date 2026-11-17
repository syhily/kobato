# Project conventions

## Quick orientation

- pnpm monorepo. The deployable app is `apps/kobato` (React Router 8 Framework Mode with SSR, `appDirectory: 'src'`, React 19 TSX/TS only); reusable code lives in workspace packages under `packages/`; path alias `@/*` → `./apps/kobato/src/*` (app-internal only).
- Packages: `@kobato/server` (`packages/server` — SSR, domains, infra; SQLite node:sqlite + a DuckDB analytics sidecar), `@kobato/web` (`packages/web` — browser `client/`, components `ui/`, `styles/`; client↔ui share one package because they reference each other), `@kobato/shared` (`packages/shared` — isomorphic contracts/DTOs/PT schema), `@kobato/inkling` (`packages/inkling` — the self-contained Lexical editor layer). `packages/helpers/` is the umbrella for development-support packages — nothing under it ships in the product: `@kobato/test` (`packages/helpers/test` — test-only utilities), `@kobato/trace` (`packages/helpers/trace` — the OpenObserve DEV container tooling), `@kobato/browser` (`packages/helpers/browser` — the real-browser Playwright journey runner, `test:browser` / `sea:browser`), `@kobato/emails` (`packages/helpers/emails` — localized email-template previews, `emails:generate`), `@kobato/i18n` (`packages/helpers/i18n` — regional terminology diff report, `i18n:regional-diff`), `@kobato/pack` (`packages/helpers/pack` — packaging tooling: SEA pipeline `src/sea/`, release automation `src/release.ts`). Beyond `packages/`: `apps/inkling-demo` (the standalone inkling playground, `pnpm demo`) and `scripts/` — standalone ops scripts that import nothing from the project (shell or node-builtins only; currently just `deploy/` deb packaging). Anything that needs project modules belongs in a helpers package, not in `scripts/`.
- Cross-package imports use the package name (`@kobato/shared/...`); intra-package imports are relative. Package dependency declarations are the layering enforcement — an undeclared cross-package import fails typecheck, not just review.
- `pnpm dev` / `pnpm start` run the process with cwd at the REPOSITORY ROOT (vite root stays `apps/kobato` via `react-router dev apps/kobato`), so the runtime's cwd-anchored paths (`kobato.config.json`, `./data`, `./drizzle`) resolve exactly as a deployed binary expects. Build-time code must anchor paths on `import.meta.url`, never on `process.cwd()`.
- Distribution is a single Node.js executable (SEA); runtime infrastructure config is `kobato.config.json`, validated through `CONFIG_TABLE`. The version carrier is `apps/kobato/package.json` (the root `package.json` is the version-less workspace manifest).
- Observability (traces/metrics/logs/browser RUM) is configured only in the admin `observability` settings section and provisioned by the server; browser RUM relays through the same-origin `/api/rum/intake` endpoint so the OpenObserve address is never exposed to visitors; `packages/helpers/trace/src/` is optional DEV container tooling (retention + smoke).

## Subdirectory conventions

Agents load these additively as they move through the codebase:

- `apps/kobato/src/routes/AGENTS.md` route modules, loaders, actions, React Router conventions; `packages/server/src/AGENTS.md` server layers, API procedures, auth, databases, content; `packages/server/src/infra/AGENTS.md` config file contract, SEA runtime rules; `packages/server/src/domains/storage/AGENTS.md` S3 config locking, storage migration, asset URLs.
- `packages/server/src/domains/backup/AGENTS.md` backup archive, encryption, restore; `packages/web/src/client/AGENTS.md` browser hooks, oRPC client, React.lazy patterns; `packages/web/src/ui/AGENTS.md` pure-props components, shadcn, PT renderer, component architecture; `packages/web/src/ui/admin/settings/AGENTS.md` settings autosave model, card wrappers.
- `packages/web/src/styles/AGENTS.md` Tailwind tokens, design-system CSS, `@theme` conventions; `packages/shared/src/AGENTS.md` isomorphic modules, Zod contracts, DTOs, PT schema; `packages/inkling/src/AGENTS.md` the Lexical editor layer: card pipeline, headless surface, labels.
- `tests/AGENTS.md` test utilities, naming conventions, coverage rules (tests live next to their package: `apps/kobato/tests/`, `packages/*/tests/`); `packages/helpers/pack/src/sea/AGENTS.md` SEA packaging, build/smoke/probe/e2e, self-update; `packages/helpers/trace/README.md` optional OpenObserve DEV container, dev retention, privacy assets, smoke.

## Skills

Agent Skills under `.agents/skills/` override these conventions on conflict; `drizzle` and `taze` are CLI-generated gitignored symlinks into `node_modules` (not repo-owned); `.claude/skills/` mirrors repo-owned skills for Claude Code via symlink.

- `react-router-framework-mode` — routes, loaders, actions, forms, navigation, `react-router.config.ts`.
- `vercel-react-best-practices` — any React/SSR code; the 70 numbered rules are the performance baseline.
- `vercel-geist-design-system` — Geist/Vercel-inspired UI: typography, spacing, color, app shells.

## Build & CI

- `pnpm run dev`, `pnpm run fmt`, `pnpm run lint`, `pnpm run type`, `pnpm run test`, `pnpm run build`
- Before committing: `pnpm run fmt && pnpm run lint && pnpm run type`, `pnpm run test`, `pnpm run build`

## Git

- Semantic commits in English: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:` — imperative mood, lowercase subject, no trailing period. Do not create commits unless explicitly asked.

## Release workflow

Use `/release <version> <next-version>` (e.g., `/release 6.3.0 6.4.0-dev`). No PRs — direct fast-forward merge from develop to main. Version is baked at build time via `vite.config.ts` `define.__APP_VERSION__`.

1. Analyze commits since last tag and draft AI-generated release notes; bump to `<version>`, push develop, fast-forward merge to main, push main.
2. Create git tag + GitHub release (the SEA workflow triggers automatically); switch back to develop, prepare `<next-version>`, push.

## Defensive constraints

Banned layer-root directories (in any package): `actions/`, `middleware/`, `layouts/`, `services/`, `hooks/`, `db/`, `content/` at a source root, and `assets/scripts/`. There is no `assets/scripts/`; all interactivity lives in React hooks/components under `packages/web/src/client/` and `packages/web/src/ui/`.

- `apps/kobato/src/blog.config.ts`, `DEFAULT_SETTINGS`, `BlogConstants`, the per-section "reset to defaults" action, and a monolithic `BlogConfigContext`/`<BlogConfigProvider>` — use per-section hooks.
- `data-admin-shell` selector; a `packages/web/src/lib/` parallel to `packages/web/src/ui/lib`; `@kobato/web/ui/admin/shadcn/components/ui/` nesting.
- Preserve public URLs, feed URLs, image endpoints, WordPress compatibility routes, and pagination routes.
- `*.server.ts` suffix is redundant inside `packages/server/src/`.
- Streamed loader promises (a loader returning an un-awaited promise) require the process-level `unhandledRejection` handler in `packages/server/src/infra/lifecycle.ts` — do not remove it.
- Never wrap the whole app (or any SSR-critical DOM that must match between server and client) in a lazy `<Suspense>` boundary whose fallback differs from the resolved content — on a cold visit the chunk is still loading at hydration time and the whole tree mismatches (React error #418). The root `LazyMotionConfig` imports its provider eagerly so a late chunk cannot replace the app tree and reset its state; other SSR-critical DOM uses a hydration-safe `useSyncExternalStore` gate or an eager import.
- Hydration-enhancement mount points in the projected `body_html` follow the same rule: the static fallback must mirror the enhanced component's initial render (the music-player card's `musicPlayerFallbackHtml` ⇔ `MusicPlayerCard` paused state, parity-pinned by `packages/web/tests/unit/ui/public/music-player/music-player.test.tsx`).
- JS-driven animation goes only through the `@kobato/web/ui/components/lazy-motion` facade (`LazyMotion*` / `LazyAnimatePresence` / `LazyMotionConfig`, or the `EagerMotion*` / `EagerAnimatePresence` browser-only nodes) — never a direct runtime `motion/react` import outside that module. Shared easing/duration constants live in `@kobato/web/client/lib/motion`; simple hover/state styling stays on CSS `transition-*` utilities.
- Never use React `<ViewTransition>` / `addTransitionType` / `document.startViewTransition` for element or navigation animation — named captures paint in the `::view-transition` overlay above every z-index; the theme-switch wipe in `packages/web/src/ui/lib/ThemeProvider.tsx` is the sole `startViewTransition` consumer.

## Dependencies

- Every version number lives in the root `pnpm-workspace.yaml` `catalog:` table (every `package.json` references entries as `"catalog:"`); `taze` edits the catalog in place. Version-exact pins (the drizzle rc pair) stay exact inside the catalog — taze treats range-less entries as locked and skips them; every other entry carries a `^` range so `pnpm bump` keeps it current.
- Each package declares every external package it imports — the declarations are the layering enforcement, so an undeclared import fails typecheck. Workspace links go in `dependencies`/`devDependencies` as `"workspace:*"` (a package's self-link lives in its own devDependencies).
- Only packages required at production runtime AND shipping a native dynamic library belong in the ROOT `package.json`'s `dependencies`: `@napi-rs/canvas` and `sharp` (per-platform binaries), `@duckdb/node-api` (`duckdb.node` + libduckdb per platform).
- Every other dependency belongs in `devDependencies` (of the package that imports it), even if the server or client bundle imports it in production: `react`, `hono`, `drizzle-orm`, `nodemailer`, `feed`, `pg`, `bcryptjs`, `dompurify`, `fast-xml-parser`.
- Distribution ships only the SEA binary built on CI with the full dev install (see `packages/helpers/pack/src/sea/AGENTS.md`): no node runtime, no node_modules, no `pnpm install --prod` step. Native packages must stay in the root `dependencies` so the build installs their platform binaries; the SEA pipeline bundles their JS and embeds the platform `.node` / libvips library files (`packages/helpers/pack/src/sea/assets.ts`).
- `drizzle-orm` / `drizzle-kit` stay pinned at `1.0.0-rc.5` (pre-release); when drizzle 1.0 stable ships, evaluate upgrading the pair together and re-run the migration contract tests before unpinning.

## Layering

Package dependency declarations enforce these rules physically; `apps/kobato/tests/arch/package-dag.test.ts` pins the exceptions.

- `@kobato/server` (`packages/server`) → `@kobato/shared`. Never `@kobato/web` or the `@kobato/inkling` React barrel.
- `@kobato/web` (`packages/web`) → `@kobato/shared`, `@kobato/inkling` (barrel). Never value-imports `@kobato/server` — the single sanctioned channel is the type-only `RouterClient<ApiRouter>` in `packages/web/src/client/api/client.ts`; every other shared shape comes from `@kobato/shared` contracts.
- `@kobato/shared` (`packages/shared`) → itself only.
- `@kobato/inkling` (`packages/inkling`) → itself only (host-agnostic editor island). The rest of the app imports it ONLY through two entry surfaces: `@kobato/inkling` (the React barrel — app routes and web) and `@kobato/inkling/headless` (react-free; the ONLY surface `@kobato/server` and `@kobato/shared` may use). Pinned by the package-dag test.
- `apps/kobato/src/routes/*` wire only: extract request context, call orchestrators, render. No DB imports or business logic inline.
- Cross-domain imports under `packages/server/src/domains/` must stay acyclic (DAG, pinned by the package-dag test).
- No barrel `index.ts` files. No `export { X } from 'y'` re-exports — import directly from the source module (`packages/inkling/` is the deliberate exception: its barrel IS the public surface). Refactor from architectural correctness, not minimal diff size.
