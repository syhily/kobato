# Project conventions

Repository conventions for AI agents and contributors.

## Quick orientation

- React Router 8 Framework Mode with SSR (`appDirectory: 'src'`), React 19 TSX/TS only, SQLite (node:sqlite) + a DuckDB analytics sidecar.
- Path alias `@/*` → `./src/*`.
- Five layers under `src/`: `routes/` (orchestration), `server/` (SSR), `client/` (browser), `ui/` (components), `shared/` (isomorphic) — plus `src/inkling/`, the self-contained Lexical editor layer.
- Distribution is a single Node.js executable (SEA); runtime infrastructure config is `kobato.config.json`, validated through `CONFIG_TABLE`.

## Subdirectory conventions

Agents load these additively as they move through the codebase:

| File                                   | Scope                                                              |
| -------------------------------------- | ------------------------------------------------------------------ |
| `src/routes/AGENTS.md`                 | Route modules, loaders, actions, React Router conventions          |
| `src/server/AGENTS.md`                 | Server layers, API procedures, auth, databases, content            |
| `src/server/infra/AGENTS.md`           | Config file contract, SEA runtime rules                            |
| `src/server/domains/storage/AGENTS.md` | S3 config locking, storage migration, asset URLs                   |
| `src/server/domains/backup/AGENTS.md`  | Backup archive, encryption, restore                                |
| `src/client/AGENTS.md`                 | Browser hooks, oRPC client, React.lazy patterns                    |
| `src/ui/AGENTS.md`                     | Pure-props components, shadcn, PT renderer, component architecture |
| `src/ui/admin/settings/AGENTS.md`      | Settings autosave model and card wrappers                          |
| `src/styles/AGENTS.md`                 | Tailwind tokens, design-system CSS, `@theme` conventions           |
| `src/shared/AGENTS.md`                 | Isomorphic modules, Zod contracts, DTOs, PT schema                 |
| `src/inkling/AGENTS.md`                | The Lexical editor layer: card pipeline, headless surface, labels  |
| `tests/AGENTS.md`                      | Test utilities, naming conventions, coverage rules                 |
| `scripts/sea/AGENTS.md`                | SEA packaging, build/smoke/probe/e2e, self-update                  |

## Skills

Agent Skills under `.agents/skills/` override these conventions on conflict:

| Skill                         | Triggers                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `react-router-framework-mode` | Routes, loaders, actions, forms, navigation, `react-router.config.ts`          |
| `vercel-react-best-practices` | Any React/SSR code. The 70 numbered rules are the performance baseline.        |
| `vercel-composition-patterns` | New components, boolean-prop matrices, compound components, context providers. |
| `vercel-geist-design-system`  | Geist/Vercel-inspired UI: typography, spacing, color, app shells.              |
| `shadcn`                      | shadcn/ui components, presets, `components.json`.                              |
| `web-design-guidelines`       | UI accessibility, UX, Web Interface Guidelines compliance.                     |
| `improve`                     | Read-only codebase audit producing prioritized implementation plans.           |

## Build & CI

- `pnpm run dev`, `pnpm run fmt`, `pnpm run lint`, `pnpm run type`, `pnpm run test`, `pnpm run build`
- Before committing: `pnpm run fmt && pnpm run lint && pnpm run type`, `pnpm run test`, `pnpm run build`

## Git

- Semantic commits in English: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:` — imperative mood, lowercase subject, no trailing period.
- Do not create commits unless explicitly asked.

## Release workflow

Use `/release <version> <next-version>` (e.g., `/release 6.3.0 6.4.0-dev`):

1. Analyze commits since last tag, draft AI-generated release notes.
2. Bump to `<version>`, push develop, fast-forward merge to main, push main.
3. Create git tag + GitHub release (the SEA workflow triggers automatically).
4. Switch back to develop, prepare `<next-version>`, push.

No PRs — direct fast-forward merge from develop to main. Version is baked at build time via `vite.config.ts` `define.__APP_VERSION__`.

## Defensive constraints

These patterns are banned:

- `src/actions`, `src/middleware`, `src/layouts`, `src/services`, `src/hooks`, `src/db`, `src/assets/scripts`, or `src/content/`.
- `src/blog.config.ts`, `DEFAULT_SETTINGS`, `BlogConstants`, or per-section "reset to defaults" action.
- Monolithic `BlogConfigContext`/`<BlogConfigProvider>`. Use per-section hooks.
- `data-admin-shell` selector.
- `src/lib/` parallel to `@/ui/lib`.
- `@/ui/admin/shadcn/components/ui/` nesting.
- Preserve public URLs, feed URLs, image endpoints, WordPress compatibility routes, and pagination routes.
- `*.server.ts` suffix is redundant inside `src/server/`.
- Streamed loader promises (a loader returning an un-awaited promise) require the process-level `unhandledRejection` handler in `src/server/infra/lifecycle.ts` — do not remove it (ADR-0005).
- Never wrap the whole app (or any SSR-critical DOM that must match between server and client) in a lazy `<Suspense>` boundary whose fallback differs from the resolved content — on a cold visit the chunk is still loading at hydration time and the whole tree mismatches (React error #418). Use the hydration-safe `useSyncExternalStore` gate (`LazyMotionConfig` in `src/ui/components/lazy-motion.tsx`), or import eagerly. The same rule applies to hydration-enhancement mount points in the projected `body_html`: the static fallback must mirror the enhanced component's initial render (the music-player card's `musicPlayerFallbackHtml` ⇔ `MusicPlayerCard` paused state, parity-pinned by `tests/unit/ui/public/music-player/music-player.test.tsx`).
- Motion Only for JS-driven animation: everything goes through the `@/ui/components/lazy-motion` facade (`LazyMotion*` / `LazyAnimatePresence` / `LazyMotionConfig`) — never a direct runtime `motion/react` import outside that module (one shared lazy chunk, one hydration-safe fallback). Never use React `<ViewTransition>` / `addTransitionType` / `document.startViewTransition` for element or navigation animation — named captures paint in the `::view-transition` overlay above every z-index; the theme-switch wipe in `src/ui/lib/ThemeProvider.tsx` is the sole `startViewTransition` consumer. Shared easing/duration constants live in `@/client/lib/motion`; simple hover/state styling stays on CSS `transition-*` utilities.

`src/assets/scripts` is intentionally absent. All interactivity lives in React hooks/components under `src/client/` and `src/ui/`.

## Dependencies

Every version number lives in the root `pnpm-workspace.yaml` `catalog:` table — the root `package.json` references entries as `"catalog:"`. `taze` edits the catalog in place. Version-exact pins (`@duckdb/node-api`, drizzle rc, the Lexical `0.46.0` family) stay exact inside the catalog — taze treats range-less entries as locked and skips them; every other entry carries a `^` range so `pnpm bump` keeps it current.

Only packages that are **required at production runtime AND ship a native dynamic library** belong in `package.json`'s `dependencies`:

- `@napi-rs/canvas`, `sharp` — native binaries fetched per platform.
- `@duckdb/node-api` — the DuckDB analytics engine (`duckdb.node` + libduckdb fetched per platform).

Every other dependency belongs in `devDependencies`, even if the server or client bundle imports it in production. Distribution ships only the SEA binary built on CI with the full dev install (see `scripts/sea/AGENTS.md`) — the rationale predates SEA (commit `ed83a5a`): no node runtime, no node_modules, no `pnpm install --prod` step. Native packages must stay in `dependencies` so the build installs their platform binaries; the SEA pipeline bundles their JS and embeds the platform `.node` / libvips library files (`scripts/sea/assets.ts`).

Examples: `react`, `hono`, `drizzle-orm`, `nodemailer`, `feed`, `pg`, `bcryptjs`, `dompurify`, `fast-xml-parser` — all `devDependencies`, despite being production imports.

**Version pins to watch.** `drizzle-orm` / `drizzle-kit` are pinned at `1.0.0-rc.5` (pre-release). Watch the drizzle 1.0 stable release; when it ships, evaluate upgrading the pair together and re-run the migration contract tests before unpinning.

## Layering

- `server/*` → `shared/*`, `server/*`. Not `client/*` or `ui/*`.
- `client/*`, `ui/*` → `shared/*`, `ui/*`, `client/*`. Not `server/*`.
- `shared/*` → `shared/*` only.
- `inkling/*` → `inkling/*` only (host-agnostic editor island). The rest of the app imports it ONLY through two entry surfaces: `@/inkling` (the React barrel, client/ui/routes) and `@/inkling/headless` (react-free; the ONLY surface `server/*` and `shared/*` may use). Pinned by the boundaries test.
- `routes/*` wire only: extract request context, call orchestrators, render. No DB imports or business logic inline.
- Cross-domain imports under `server/domains/` must stay acyclic (DAG, pinned by contract test).
- No barrel `index.ts` files. No `export { X } from 'y'` re-exports — import directly from the source module. (`src/inkling/` is the deliberate exception: its barrel IS the public surface.)
- Refactor from architectural correctness, not minimal diff size.
