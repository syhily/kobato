# Project conventions

Repository conventions for AI agents and contributors.

## Quick orientation

- React Router 8 Framework Mode with SSR (`appDirectory: 'src'`), React 19 TSX/TS only, Postgres.
- Path alias `@/*` → `./src/*`.
- Five layers under `src/`: `routes/` (orchestration), `server/` (SSR), `client/` (browser), `ui/` (components), `shared/` (isomorphic).

## Config file

Infrastructure configuration lives in `kobato.config.json` — auto-created with defaults when missing. `src/server/infra/config.ts`'s `CONFIG_TABLE` maps nested config paths to TS exports with Zod schemas; env var names are derived by convention (`path.join('__')` → `database__url`).

- Location order: `--config <path>` → SEA `<execDir>/kobato.config.json` → `./kobato.config.json` → `~/.config/kobato.config.json`. First existing wins.
- Precedence: schema defaults < config file < env vars. Env values differing from the file are written back.
- `VITEST=true` without `--config` → env-only, zero filesystem access.
- Tooling that spawns the binary MUST pass `--config <tempDir>/…` to avoid persisting throwaway config next to the binary.
- Adding a config value: add a `CONFIG_TABLE` row → update `kobato.config.example.json` + `.env.example` → cover it in `tests/unit/server/infra/config.test.ts`.

## Subdirectory conventions

Claude loads these additively as it moves through the codebase:

| File                   | Scope                                                              |
| ---------------------- | ------------------------------------------------------------------ |
| `src/routes/AGENTS.md` | Route modules, loaders, actions, React Router conventions          |
| `src/server/AGENTS.md` | Server layers (infra, domains, http, render), API procedures, auth |
| `src/client/AGENTS.md` | Browser hooks, oRPC client, React.lazy patterns                    |
| `src/ui/AGENTS.md`     | Pure-props components, shadcn, PT renderer, component architecture |
| `src/styles/AGENTS.md` | Tailwind tokens, design-system CSS, `@theme` conventions           |
| `src/shared/AGENTS.md` | Isomorphic modules, Zod contracts, DTOs, PT schema                 |
| `tests/AGENTS.md`      | Test utilities, naming conventions, coverage rules                 |

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

## Route module prewarming

A Vite plugin splits ~500 client chunks into tiers so the browser proactively loads high-priority routes. At request time, `src/server/render/warmup/manifest.ts` matches the pathname against the route tree and emits critical `<link rel="modulepreload">` for the matched route and its ancestor layouts. Idle tiers preload lower-priority chunks via inline `<script>`.

When adding or removing routes from `src/routes.ts`, update the tier arrays in `src/server/infra/route-warmup.ts`.

## SEA packaging

The production server ships as a Node.js single executable: the server bundle, client assets, drizzle migrations, wasm, and worker code are embedded in the binary. Only native packages (sharp, sharp-ico, @napi-rs/canvas) are extracted to a cache dir on first run.

- `pnpm run sea:build` → `dist-sea/kobato` (+ `.sha256`). Do NOT add UPX compression.
- `pnpm run sea:smoke [binary]` — deep smoke: CLI flags, natives, worker pool, boot + migrations, install gate, SSR, config-file convergence, HTTP checks, graceful shutdown.
- `pnpm run sea:e2e [binary]` — boots the binary like managed smoke, then runs `tests/e2e` over real HTTP.
- Binary CLI flags: `--version`, `--help`, `--smoke-natives`, `--smoke-worker`.
- Delivery targets: linux-x64 / linux-arm64 / darwin-arm64 / darwin-x64 / win32-x64 / win32-arm64.

Runtime rules:

- NEVER statically value-import `sharp`, `sharp-ico`, or `@napi-rs/canvas` — always `requireExternal` from `@/server/infra/sea`.
- Runtime file reads that must work under SEA go through `getEmbeddedAsset` / `listEmbeddedAssetKeys`.
- Embedded asset keys are owned by `src/shared/sea/assets.ts`. Never hardcode a key in `scripts/` or `src/server/`.

### SEA self-update

Bare-metal SEA deployments can self-update from the admin shell. The pipeline lives in `src/server/domains/update/`: download the release asset, verify against `.sha256`, swap the binary, restart. The gate requires: `isSea()`, linux x64/arm64, not containerized, writable binary directory, non-`-dev` build. Admin procedures: `admin.update.check` / `admin.update.apply` / `admin.update.status`.

Manual rollback: `mv kobato.bak kobato && systemctl restart <service>`.

## Git

- Semantic commits in English: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:` — imperative mood, lowercase subject, no trailing period.
- Do not create commits unless explicitly asked.

## Release workflow

Use `/release <version>` (e.g., `/release 6.3.0`):

1. Analyze commits since last tag, draft AI-generated release notes.
2. Bump version, push develop, fast-forward merge to main, push main.
3. Create git tag + GitHub release (Docker and SEA workflows trigger automatically).
4. Switch back to develop, prepare next patch version, push.

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

`src/assets/scripts` is intentionally absent. All interactivity lives in
React hooks/components under `src/client/` and `src/ui/`.

## Dependencies

Only `@napi-rs/canvas` and `sharp` belong in `dependencies` (they ship native dynamic libraries). Everything else goes in `devDependencies` — the production image ships a SEA binary built from the full dev install, with no runtime `node_modules`.

## Settings autosave

`/admin/settings` saves per-card via `useSettingsCard` backed by `useSettingsMutation.commit(section, payload)`. The save model is **blur-driven**, not debounce-driven — typing never fires a request. The save response is authoritative: the card adopts it as its new baseline without refetching.

Controls trigger saves differently:

| Control                                 | Trigger       | When it fires                      |
| --------------------------------------- | ------------- | ---------------------------------- |
| Text `<Input>` / `<Textarea>`           | `flushOnBlur` | Input loses focus; no-op if clean  |
| Switch / RadioGroup / Select / Combobox | `save`        | `onChange`, immediately            |
| List append/remove/move                 | none          | Relies on the next blur or a flush |

Framework-level flushes (close, ESC, scroll-away, page hide) call every registered card via `SettingsFlushProvider`.

Adding a settings card:

1. Use `useSettingsCard()` — destructure `flushOnBlur` for text inputs, `save` for switches/selects/radios.
2. Text inputs: render through `<SettingsInput flushOnBlur={flushOnBlur} {...form.register('x')}>` — never bare `<Input>`. Multi-line: `<SettingsTextarea>`. Secrets: `<SettingsSecretInput>`.
3. Switch/select/radio/combobox: render through the wrapper components in `src/ui/admin/settings/shell/` with `save={save}` — never hand-roll `onValueChange`.
4. List buttons MUST NOT call `save()` — let the next blur/flush commit the whole list.
5. `useSettingsCard` only re-seeds the form when clean, and only if `toState(source)` differs from current form values — prevents lost edits and focus drops.

Each card POSTs an honest Section patch (owned fields only). The server deep-merges, validates, and writes only that row. `src/shared/config/merge-section-patch.ts` is the single merge implementation.

## Layering

- `server/*` → `shared/*`, `server/*`. Not `client/*` or `ui/*`.
- `client/*`, `ui/*` → `shared/*`, `ui/*`, `client/*`. Not `server/*`.
- `shared/*` → `shared/*` only.
- `routes/*` wire only: extract request context, call orchestrators, render. No DB imports or business logic inline.
- Cross-domain imports under `server/domains/` must stay acyclic (DAG, pinned by contract test).
- No barrel `index.ts` files. No `export { X } from 'y'` re-exports — import directly from the source module.
- Refactor from architectural correctness, not minimal diff size.
