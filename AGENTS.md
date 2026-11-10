# Project conventions

## Quick orientation

- React Router 8 Framework Mode with SSR (`appDirectory: 'src'`), React 19 TSX/TS only, SQLite (node:sqlite) + a DuckDB analytics sidecar; path alias `@/*` → `./src/*`.
- Five layers under `src/`: `routes/` (orchestration), `server/` (SSR), `client/` (browser), `ui/` (components), `shared/` (isomorphic) — plus `src/inkling/`, the self-contained Lexical editor layer.
- Distribution is a single Node.js executable (SEA); runtime infrastructure config is `kobato.config.json`, validated through `CONFIG_TABLE`.
- Observability (traces/metrics/logs/browser RUM) is configured only in the admin `observability` settings section and provisioned by the server; browser RUM relays through the same-origin `/api/rum/intake` endpoint so the OpenObserve address is never exposed to visitors; `scripts/trace/` is optional DEV container tooling (retention + smoke).

## Subdirectory conventions

Agents load these additively as they move through the codebase:

- `src/routes/AGENTS.md` route modules, loaders, actions, React Router conventions; `src/server/AGENTS.md` server layers, API procedures, auth, databases, content; `src/server/infra/AGENTS.md` config file contract, SEA runtime rules; `src/server/domains/storage/AGENTS.md` S3 config locking, storage migration, asset URLs.
- `src/server/domains/backup/AGENTS.md` backup archive, encryption, restore; `src/client/AGENTS.md` browser hooks, oRPC client, React.lazy patterns; `src/ui/AGENTS.md` pure-props components, shadcn, PT renderer, component architecture; `src/ui/admin/settings/AGENTS.md` settings autosave model, card wrappers.
- `src/styles/AGENTS.md` Tailwind tokens, design-system CSS, `@theme` conventions; `src/shared/AGENTS.md` isomorphic modules, Zod contracts, DTOs, PT schema; `src/inkling/AGENTS.md` the Lexical editor layer: card pipeline, headless surface, labels.
- `tests/AGENTS.md` test utilities, naming conventions, coverage rules; `scripts/sea/AGENTS.md` SEA packaging, build/smoke/probe/e2e, self-update; `scripts/trace/README.md` optional OpenObserve DEV container, dev retention, privacy assets, smoke.

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

Banned paths: `src/actions`, `src/middleware`, `src/layouts`, `src/services`, `src/hooks`, `src/db`, `src/assets/scripts`, `src/content/`. `src/assets/scripts` is intentionally absent; all interactivity lives in React hooks/components under `src/client/` and `src/ui/`.

- `src/blog.config.ts`, `DEFAULT_SETTINGS`, `BlogConstants`, the per-section "reset to defaults" action, and a monolithic `BlogConfigContext`/`<BlogConfigProvider>` — use per-section hooks.
- `data-admin-shell` selector; `src/lib/` parallel to `@/ui/lib`; `@/ui/admin/shadcn/components/ui/` nesting.
- Preserve public URLs, feed URLs, image endpoints, WordPress compatibility routes, and pagination routes.
- `*.server.ts` suffix is redundant inside `src/server/`.
- Streamed loader promises (a loader returning an un-awaited promise) require the process-level `unhandledRejection` handler in `src/server/infra/lifecycle.ts` — do not remove it.
- Never wrap the whole app (or any SSR-critical DOM that must match between server and client) in a lazy `<Suspense>` boundary whose fallback differs from the resolved content — on a cold visit the chunk is still loading at hydration time and the whole tree mismatches (React error #418). The root `LazyMotionConfig` imports its provider eagerly so a late chunk cannot replace the app tree and reset its state; other SSR-critical DOM uses a hydration-safe `useSyncExternalStore` gate or an eager import.
- Hydration-enhancement mount points in the projected `body_html` follow the same rule: the static fallback must mirror the enhanced component's initial render (the music-player card's `musicPlayerFallbackHtml` ⇔ `MusicPlayerCard` paused state, parity-pinned by `tests/unit/ui/public/music-player/music-player.test.tsx`).
- JS-driven animation goes only through the `@/ui/components/lazy-motion` facade (`LazyMotion*` / `LazyAnimatePresence` / `LazyMotionConfig`, or the `EagerMotion*` / `EagerAnimatePresence` browser-only nodes) — never a direct runtime `motion/react` import outside that module. Shared easing/duration constants live in `@/client/lib/motion`; simple hover/state styling stays on CSS `transition-*` utilities.
- Never use React `<ViewTransition>` / `addTransitionType` / `document.startViewTransition` for element or navigation animation — named captures paint in the `::view-transition` overlay above every z-index; the theme-switch wipe in `src/ui/lib/ThemeProvider.tsx` is the sole `startViewTransition` consumer.

## Dependencies

- Every version number lives in the root `pnpm-workspace.yaml` `catalog:` table (the root `package.json` references entries as `"catalog:"`); `taze` edits the catalog in place. Version-exact pins (the drizzle rc pair) stay exact inside the catalog — taze treats range-less entries as locked and skips them; every other entry carries a `^` range so `pnpm bump` keeps it current.
- Only packages required at production runtime AND shipping a native dynamic library belong in `package.json`'s `dependencies`: `@napi-rs/canvas` and `sharp` (per-platform binaries), `@duckdb/node-api` (`duckdb.node` + libduckdb per platform).
- Every other dependency belongs in `devDependencies`, even if the server or client bundle imports it in production: `react`, `hono`, `drizzle-orm`, `nodemailer`, `feed`, `pg`, `bcryptjs`, `dompurify`, `fast-xml-parser`.
- Distribution ships only the SEA binary built on CI with the full dev install (see `scripts/sea/AGENTS.md`): no node runtime, no node_modules, no `pnpm install --prod` step. Native packages must stay in `dependencies` so the build installs their platform binaries; the SEA pipeline bundles their JS and embeds the platform `.node` / libvips library files (`scripts/sea/assets.ts`).
- `drizzle-orm` / `drizzle-kit` stay pinned at `1.0.0-rc.5` (pre-release); when drizzle 1.0 stable ships, evaluate upgrading the pair together and re-run the migration contract tests before unpinning.

## Layering

- `server/*` → `shared/*`, `server/*`. Not `client/*` or `ui/*`.
- `client/*`, `ui/*` → `shared/*`, `ui/*`, `client/*`. Not `server/*`.
- `shared/*` → `shared/*` only.
- `inkling/*` → `inkling/*` only (host-agnostic editor island). The rest of the app imports it ONLY through two entry surfaces: `@/inkling` (the React barrel, client/ui/routes) and `@/inkling/headless` (react-free; the ONLY surface `server/*` and `shared/*` may use). Pinned by the boundaries test.
- `routes/*` wire only: extract request context, call orchestrators, render. No DB imports or business logic inline.
- Cross-domain imports under `server/domains/` must stay acyclic (DAG, pinned by contract test).
- No barrel `index.ts` files. No `export { X } from 'y'` re-exports — import directly from the source module (`src/inkling/` is the deliberate exception: its barrel IS the public surface). Refactor from architectural correctness, not minimal diff size.
