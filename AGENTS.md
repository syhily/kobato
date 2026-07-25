# Project conventions

Repository conventions for AI agents and contributors.

## Quick orientation

- React Router 8 Framework Mode with SSR (`appDirectory: 'src'`).
- React 19 TSX/TS only.
- Postgres.
- Path alias `@/*` → `./src/*`.
- Five layers under `src/`: `routes/` (orchestration), `server/` (SSR),
  `client/` (browser), `ui/` (components), `shared/` (isomorphic).

## Config file

Infrastructure configuration (database, secrets, paths, logging)
lives in `kobato.config.json` — always present, auto-created with defaults
when missing. `src/server/infra/config.ts`'s `CONFIG_TABLE` is the single
source of truth: each row maps a nested config path (`database.url`) to a
TS export name (`env.DATABASE_URL`) and a Zod schema; the process env var
name is derived by convention (`path.join('__')` → `database__url`).

- Location order: `--config <path>` / `-c <path>` → SEA
  `<execDir>/kobato.config.json` (non-SEA skips it) → `./kobato.config.json`
  → `~/.config/kobato.config.json`. First existing wins; none → created at
  the first candidate with mode `0o600`.
- Precedence: schema defaults < config file < env vars. Env-provided
  values that differ from the file are **written back into it** — env is
  the injection mechanism, the file converges to the effective config.
- Flat legacy env names (`DATABASE_URL` etc.) were removed — only the
  `__` names work. The TS export names are unchanged, so `src/`
  consumers don't care.
- Legacy config keys are migrated on load (`migrateLegacyKeys` in
  `config.ts`): `auth.sessionSecret` → `security.sessionSecret`,
  `paths.*` → `storage.*`, `logging.level` → `server.loggingLevel`, and
  the removed `redis` block is dropped. The file is rewritten and a
  Chinese stderr line summarizes the applied migrations. Legacy ENV var
  names are NOT migrated — only the file keys.
- `VITEST=true` without `--config` → env-only, zero filesystem access
  (tests must not create files in the repo). An explicit `--config` opts
  into full behavior (config tests point it at a temp dir).
- Tooling that spawns the binary MUST pass `--config <tempDir>/…`
  (`scripts/sea/instance.ts` bootServer, smoke's `--smoke-worker` check) —
  otherwise env loading auto-creates `kobato.config.json` next to the
  binary and persists throwaway database URLs and smoke secrets into it.
- `NODE_ENV`, `KOBATO_CACHE_DIR`, `KOBATO_NATIVES_DIR` stay process-env
  only. Blog settings stay in the DB.
- Adding a config value: add a `CONFIG_TABLE` row → update
  `kobato.config.example.json` + `.env.example` → cover it in
  `tests/unit/server/infra/config.test.ts`.

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

Conventions below are calibrated against the agent Skills under
`.agents/skills/`. Open SKILL.md and any referenced rule files _before_
writing code when a task triggers one:

| Skill                         | Triggers                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `react-router-framework-mode` | Routes, loaders, actions, forms, navigation, `react-router.config.ts`          |
| `vercel-react-best-practices` | Any React/SSR code. The 70 numbered rules are the performance baseline.        |
| `vercel-composition-patterns` | New components, boolean-prop matrices, compound components, context providers. |
| `shadcn`                      | shadcn/ui components, presets, `components.json`.                              |
| `tailwind-design-system`      | CSS tokens, design-system primitives, Tailwind v4 `@theme` changes.            |
| `web-design-guidelines`       | UI accessibility, UX, Web Interface Guidelines compliance.                     |
| `privacy-logging`             | Log output, audit events, error handling that touches user data.               |

Skills win on conflict. Quote stable rule ids in PR review (e.g.
`bundle-barrel-imports`, `architecture-avoid-boolean-props`,
`server-no-shared-module-state`).

## Build & CI

- `pnpm run dev`, `pnpm run fmt`, `pnpm run lint`, `pnpm run type`,
  `pnpm run test`, `pnpm run build`
- Before committing: `pnpm run fmt && pnpm run lint && pnpm run type`,
  `pnpm run test`, `pnpm run build`

## Route module prewarming

The build produces ~500 JS chunks (13 MB). A Vite plugin
(`src/server/infra/route-warmup.ts`) splits them into tiers so the browser
proactively loads high-priority route chunks:

| Tier          | What                                      | Mechanism                                     |
| ------------- | ----------------------------------------- | --------------------------------------------- |
| critical path | Matched launch route only                 | `<link rel="modulepreload">` in HTML `<head>` |
| tier 1        | Public layout + home (fallback)           | `<link rel="modulepreload">` in HTML `<head>` |
| tier 2 public | Archives, categories, tags, search, pages | Idle `modulepreload` via inline `<script>`    |
| tier 2 admin  | Dashboard, posts, settings, etc.          | Idle warmup (authenticated admins only)       |
| tier 2 editor | Editor shells                             | Idle warmup (admins only)                     |
| tier 2 auth   | Signin, setup                             | Idle warmup (all visitors)                    |

The plugin runs in the SSR `writeBundle` hook (after both client and server
builds finish), reads the client manifest `build/client/assets/manifest-*.js`,
and writes `build/client/assets/warmup-manifest.json`. At request time,
`src/server/render/warmup/manifest.ts` re-reads the client manifest, matches
the pathname with `matchRoutes`, and emits critical preloads for the matched
route and its ancestor layouts — keeping the first-screen preload tight
instead of widening it with unrelated routes.

**Key files:**

| File                                          | Role                                            |
| --------------------------------------------- | ----------------------------------------------- |
| `src/shared/route-warmup/manifest.ts`         | File-contract owner — parse, validate, collect  |
| `src/server/infra/route-warmup.ts`            | Vite plugin — manifest generation               |
| `src/server/render/warmup/manifest.ts`        | Server-side manifest reader + route matcher     |
| `src/client/components/RouteWarmupScript.tsx` | Presentational — renders idle-warmup `<script>` |
| `src/root.tsx`                                | Layout wires critical links + tier-2 script     |

**Exclusion rules:** heavy lazy-only chunks are excluded from critical and
idle preloads (`canvas-*`, `ImageEditorCanvas-*`, `qrcode*`, `player-*`);
`editor-tiptap-*` is allowed only in the editor idle tier; Shiki grammar
chunks are excluded (not in any route's `imports` array); chunks > 100 KB
are excluded from idle warmup. The idle script respects
`navigator.connection.saveData`, skips 2g, and defers until the page is
visible.

When adding or removing routes from `src/routes.ts`, update the tier arrays
in `src/server/infra/route-warmup.ts` (`TIER2_PUBLIC_ROUTES`,
`TIER2_ADMIN_ROUTES`, etc.) to keep the warmup manifest in sync.

## SEA packaging

The production server also ships as a Node.js single executable (SEA):
the server bundle plus client assets, drizzle migrations, wasm, and
worker code are embedded in the binary and read from memory
(`src/server/infra/sea.ts`); only the native packages (sharp, sharp-ico,
@napi-rs/canvas) are extracted to a cache dir on first run
(`src/server/infra/sea-natives.ts`).

- `pnpm run sea:build` → `dist-sea/kobato` (+ `.sha256`). The binary is
  deliberately NOT UPX-compressed — every ordering is a verified dead end
  (UPX 5.2.0, linux x64): inject-then-compress fails with
  `CantPackException: bad e_phoff` (postject relocates the phdrs,
  [postject#87](https://github.com/nodejs/postject/issues/87));
  `--force-execve` fails with `UnknownExecutableFormatException`;
  compress-then-inject destroys the sentinel fuse; and Node finds the
  blob via `dl_iterate_phdr` on the in-memory phdrs, which a packed stub
  does not present. Do not re-add an UPX step.
- `pnpm run sea:smoke [binary]` — 18-check deep smoke: version, natives,
  `--smoke-worker` (a real sharp job round-tripping through the
  `worker_threads` image pool), boot + migrations on a per-run
  `kobato_smoke_<rand>` database (created on the same Postgres server,
  dropped in cleanup — the shared `test` DB is never touched),
  fresh-install gate, SSR, embedded asset, **config-file convergence**
  (the env-driven boot writes `database.url` + secrets back into
  `--config`'s temp file), SQL seed (one minimal admin row plus the
  `blog.general` / `blog.assets` roots — hydration backfills the rest),
  a graceful restart on a **reduced env that proves the converged file
  alone boots the server** (the settings snapshot only loads at boot;
  the install gate is evaluated per request), installed `/health` and
  `/` SSR, the @napi-rs/canvas calendar endpoint over HTTP, SIGTERM ×2,
  natives-cache reuse ×2. `--external <url>` runs only the HTTP checks
  against an already-running server (e.g. a container), seeds nothing,
  and reports the calendar check as SKIP on uninstalled instances.
  `--binary-only [binary]` runs just the service-free checks (version,
  natives, worker pool) — the mode the macOS and Windows CI targets use
  (neither can host the Postgres service container).
- `pnpm run sea:e2e [binary]` — boots the binary like the managed smoke
  (per-run database, migrations, seeded admin with a KNOWN random
  password), then runs `tests/e2e` against the live server over real
  HTTP: signin flow, public pages/feed/sitemap, and an admin
  create→render→delete round-trip via oRPC. The instance lifecycle is
  shared with the smoke via `scripts/sea/instance.ts`. The Linux CI
  matrix runs this right after `sea:smoke`.
- Binary CLI flags: `--version`, `--help`, `--smoke-natives`,
  `--smoke-worker`. The first three need zero environment; the last one
  requires the full server configuration because the pool graph pulls in
  `@/server/infra/env` at import time — it validates but never connects.
- Delivery targets are linux-x64 / linux-arm64 / darwin-arm64 /
  darwin-x64 / win32-x64 / win32-arm64, built by
  `.github/workflows/sea.yml`. The deep managed smoke stays Linux-only;
  the darwin and win32 matrix jobs run `--binary-only`. The darwin jobs
  need the `shasum -a 256` spelling (macOS has no `sha256sum`); the
  win32 jobs run the rename/package steps under Git Bash (`shell: bash`)
  and ship `kobato.exe`. Local macOS builds need an official Node.js 24
  distribution — Homebrew's node lacks the SEA sentinel fuse
  (`scripts/sea/inject.ts` preflights this). An official tarball is
  cached under the gitignored `tmp/`.
- Windows runtime notes: the binary is `kobato.exe` (no extension →
  refuses to execute); the build spawns everything through cmd
  (`shell: true` in `scripts/sea/exec.ts`) because pnpm and the
  `.bin/postject` entry are `.cmd` shims there. The natives cache
  defaults to `%LOCALAPPDATA%\kobato` (`resolveCacheDir`). Windows
  delivers no SIGTERM — graceful shutdown relies on SIGINT (Ctrl+C),
  SIGHUP (console window closed), and SIGBREAK (Ctrl+Break), all
  registered in `src/server/infra/lifecycle.ts`; service deployments
  should wrap the binary with WinSW/NSSM, whose stop action sends
  Ctrl+C into that same path. `taskkill /F` (TerminateProcess) can
  never be graceful, on any platform level.

Runtime rules for contributors:

- NEVER statically value-import `sharp`, `sharp-ico`, or
  `@napi-rs/canvas` — always `requireExternal` from `@/server/infra/sea`
  (`import type` stays legal). Enforced by a boundaries contract test
  (`tests/unit/shared/contracts/boundaries.test.ts`).
- Runtime file reads that must work under SEA go through
  `getEmbeddedAsset` / `listEmbeddedAssetKeys`. New resource types must
  be added to `scripts/sea/assets.ts` AND read via the sea helpers with
  a non-SEA fallback.
- Embedded asset keys are owned by `src/shared/sea/assets.ts` — the
  single owner of the writer/reader key contract. New keys go there;
  never hardcode a key in `scripts/` or `src/server/`. Enforced by
  `tests/unit/shared/contracts/sea-assets.test.ts`.
- `KOBATO_NATIVES_DIR` / `KOBATO_CACHE_DIR` are documented runtime env
  vars, deliberately read outside `env.ts` (see the allowlist comment on
  the process.env centralization rule in the boundaries test).

The production Docker image ships only the SEA binary on a glibc base —
musl is blocked by a postject `.gnu.hash` corruption bug on the musl
node binary (see the comment at the top of `Dockerfile`).

### SEA self-update

Bare-metal SEA deployments can update themselves from the admin shell
(VersionDialog → 检查更新 → 立即更新). The pipeline lives in
`src/server/domains/update/` and is modeled on AdGuardHome's
`internal/updater`: stage in `<execDir>/.kobato-update/`, stream-download
the release asset (`kobato-linux-<arch>.tar.gz`, 512 MB cap), verify
against the `.sha256` sidecar, extract the bare binary, `chmod 0o755`,
rename the live binary to `<binary>.bak`, swap, then restart (detached
re-spawn + `process.exit(0)`). Failures after the backup step restore the
`.bak` best-effort; the stage dir is always cleaned.

The gate (`gate.ts`) requires ALL of: `isSea()`, linux x64/arm64, not
containerized (`/.dockerenv` / `/proc/1/cgroup`), a writable binary
directory, and a non-`-dev` build. Refusals surface as Chinese admin-facing
strings in `reasons` — Docker deployments are refused by design (upgrade by
pulling a new image), and so are darwin/win32 (macOS would need re-signing
after the swap; Windows self-update is out of scope). Never bypass the
gate from a new caller.

Admin procedures: `admin.update.check` / `admin.update.apply` /
`admin.update.status` (oRPC, admin role). `apply` runs the job in-process
in the background (one at a time; a concurrent apply is CONFLICT) and
emits a `system_updated` audit event; the UI polls `status` every 1.5 s.
There is no `'succeeded'` job state — the process exits on success and the
UI reloads into the new version.

Manual rollback: `mv kobato.bak kobato && systemctl restart <service>`
(or the supervisor equivalent). The `.bak` sibling is left in place
deliberately after a successful swap.

## Git

- Semantic commits in English: `feat:`, `fix:`, `docs:`, `refactor:`,
  `test:`, `chore:`
- Imperative mood, lowercase subject, no trailing period.
- Do not create commits unless explicitly asked.

## Release workflow

Use `/release <version>` (e.g., `/release 6.3.0`). The command is defined
in `.claude/commands/release.md` and drives the full lifecycle:

1. Analyze commits since last tag, draft AI-generated release notes
   (user reviews and approves).
2. Bump version, push develop, fast-forward merge to main, push main.
3. Create git tag + GitHub release (Docker image builds automatically
   via `.github/workflows/docker.yml`; the SEA workflow attaches the
   `kobato-linux-*.tar.gz` archives plus `.sha256` sidecars).
4. Switch back to develop, prepare next patch version, push.

No PRs — direct fast-forward merge from develop to main.

Version is baked at build time via `vite.config.ts` `define.__APP_VERSION__`.
`docker-compose.yml` image tag is synced by the bump/prepare-next scripts.

## Defensive constraints

These patterns are banned:

- `src/actions`, `src/middleware`, `src/layouts`, `src/services`,
  `src/hooks`, `src/db`, `src/assets/scripts`, or `src/content/`.
- `src/blog.config.ts`, `DEFAULT_SETTINGS`, `BlogConstants`, or
  per-section "reset to defaults" action.
- Monolithic `BlogConfigContext`/`<BlogConfigProvider>`. Use
  per-section hooks.
- `data-admin-shell` selector.
- `src/lib/` parallel to `@/ui/lib`.
- `@/ui/admin/shadcn/components/ui/` nesting.
- Preserve public URLs, feed URLs, image endpoints, WordPress
  compatibility routes, and pagination routes unless explicitly asked to
  change them.
- `*.server.ts` suffix is redundant inside `src/server/`.

`src/assets/scripts` is intentionally absent. All interactivity lives in
React hooks/components under `src/client/` and `src/ui/`.

## Dependencies

Only packages that are **required at production runtime AND ship a native
dynamic library** belong in `package.json`'s `dependencies`:

- `@napi-rs/canvas`, `sharp` — native binaries fetched per platform.

Every other dependency belongs in `devDependencies`, even if the server or
client bundle imports it in production. The production image ships a SEA
binary: the build stage runs `pnpm install --frozen-lockfile` with the full
dev dependencies and bundles the server, and the runtime stage contains
only that binary — no node runtime, no node_modules, no second
`pnpm install --prod` (that two-stage install was the pre-SEA rationale,
see commit `ed83a5a`). Native packages must stay in `dependencies` so the
build stage installs their platform binaries and the SEA assets collector
(`scripts/sea/assets.ts`) can embed each package's installed dependency
closure.

Examples: `react`, `hono`, `drizzle-orm`, `nodemailer`,
`sanitize-html`, `feed`, `pg`, `bcryptjs`, `dompurify`, `fast-xml-parser` —
all `devDependencies`, despite being production imports.

## Settings autosave

`/admin/settings` saves per-card, not per-form. Every card is a
`useSettingsCard` instance backed by `useSettingsMutation.commit(section, payload)`.
The save trigger model is **blur-driven, not debounce-driven** — there is no
`onChange` autosave anywhere.

**The save response is authoritative (Ghost's `useEditSettings`
discipline):** `admin.settings.update` returns the merged, validated section
in admin display shape (masks merged in for assets/mail/search — see
`projectSectionForAdmin`). The card adopts the response as its new baseline
(`savedSource`) and the mutation deliberately does NOT call
`revalidator.revalidate()` — a save must never refetch the document out
from under the user's hands. Other cards converge on next navigation
(accepted eventual consistency).

**Three triggers, each wired to a specific control type:**

| Control                                 | Trigger       | When it fires                      |
| --------------------------------------- | ------------- | ---------------------------------- |
| Text `<Input>` / `<Textarea>`           | `flushOnBlur` | Input loses focus; no-op if clean  |
| Switch / RadioGroup / Select / Combobox | `save`        | `onChange`, immediately            |
| List append/remove/move                 | none          | Relies on the next blur or a flush |

Three framework-level flushes call every registered card via
`SettingsFlushProvider`: close button + ESC (`flushAll`), scroll-away
(`IntersectionObserver` → `flushSection(id)`), and page hide
(`visibilitychange` / `pagehide` → `flushAll`).

**Adding / editing a settings card — the rules:**

1. Destructure the trigger you need from `useSettingsCard()`:
   - text input → `flushOnBlur`
   - switch/select/radio → `save` (never call `save` from a text input)
   - the panel-level flushes invoke the same `flushOnBlur` through the
     SettingsFlushProvider registry — there is no separate `flush` member
2. Render text inputs through `<SettingsInput flushOnBlur={flushOnBlur} {...form.register('x')}>`
   — **never** bare `<Input>`. The wrapper merges RHF's onBlur with
   `flushOnBlur`; spreading `register` first would clobber it. For multi-line
   controlled fields use `<SettingsTextarea flushOnBlur={flushOnBlur}>`.
   Secret fields (API keys, passwords) render through
   `<SettingsSecretInput>` and build their `fromState` line with
   `secretFieldPatch(value, 'fieldName')` + `secretFieldStrings(...)`
   (`src/ui/admin/settings/shell/SettingsSecretInput.tsx`) — the
   omit-on-empty rule and the mask hint live in that one module.
3. Render switch/select/radio/combobox/checkbox controls through the
   `SettingsSwitch` / `SettingsSelect` / `SettingsRadioGroup` /
   `SettingsCombobox` / `SettingsCheckbox` wrappers
   (`src/ui/admin/settings/shell/`) with `save={save}` — the wrapper
   fires `field.onChange` first, then `save()`. **Never** hand-roll
   `onValueChange={(v) => { field.onChange(v); save() }}` — the
   boundaries contract test flags both the hand-rolled handler and a
   bare `={field.onChange}` in any card that imports no wrapper.
4. List append/remove/move buttons MUST NOT call `save()` — they leave the
   form dirty and the next blur/flush commits the whole list. Calling
   `save()` on append would filter empty rows in `fromState`, shrink the
   payload, and wipe the row the user just added.
5. Don't destructure `flushOnBlur` in a card that has no text input —
   `no-unused-vars` is enforced.

**Reseed guard (backstop — do not remove):** `useSettingsCard` only re-seeds
the form from a new `source` prop when the form is **clean** (`getValues()`
deep-equals `lastCommitted`). A new `source` identity only arrives on
navigation back to the page or a remote concurrent edit; when it does and
the user has uncommitted edits, the card keeps the user's input. Removing
this guard re-introduces the "empty row disappears" bug. Accepted
trade-off: a remote concurrent edit to the same section won't surface
until the local edit is committed.

**No-op reseed skip (do not remove):** even when clean, the reseed calls
`reset()` ONLY if `toState(source)` deep-differs from the current form
values. An unconditional `reset()` regenerates `useFieldArray` ids
(remounting every row and dropping focus mid-typing) and clobbers the
caret in plain inputs — the "one letter and the social-link input loses
focus" bug.

**No `debounceMs` option** — it was removed. Don't re-add onChange
auto-save; typing never fires a request.

**Section patch (write path):** every card POSTs an honest Section patch —
only the fields the card owns. There is no client-side merge: the server
deep-merges the patch into the stored row (objects merge recursively,
arrays replace wholesale), validates the merged section against the
registry schema, and only then writes it. Patch keys are strict — an
unknown key at any depth rejects with 400. Concretely:

- `fromState` returns only the owned fields. Never emit loader mask
  fields (`apiKeyMask`, `secretAccessKeyMask`, …) or re-spread untouched
  sibling buckets (`...source.bucket`) — masks 400 on the strict walker,
  siblings are preserved by the server merge.
- The hook has **no `mode` option** (`'patch' | 'full'` was removed). A
  card that owns its whole section returns its full state — a complete
  object is a valid patch (`ThresholdForm` is the example).
- List edits (append/remove/move) stay dirty-form commits — the whole
  list is one array field and replaces the stored array on save.
- `useSettingsCard`'s `display` is the latest **server-confirmed** section
  (the save response, masks/font families included), falling back to the
  loader snapshot. It is never POSTed.
- `src/shared/config/merge-section-patch.ts` is the single merge
  implementation — used by the server write base only. Do not fork it.

## Layering

- `server/*` may import `shared/*` and other `server/*`. Not `client/*`
  or `ui/*`.
- `client/*` and `ui/*` may import `shared/*`, `ui/*`, `client/*`. Not
  any `server/*` module or `.server.*` file.
- `shared/*` imports `shared/*` only.
- `routes/*` may import from any layer; route components must accept
  plain props.
- Avoid barrel `index.ts` files (`bundle-barrel-imports`).
- No `export { X } from 'y'` or `export type { X } from 'y'` re-exports
  anywhere in the project. Import directly from the source module
  (`import { X } from '@/shared/types/foo'`, not via an intermediate
  file that re-exports it). `shared/*` is isomorphic and globally
  importable — there is never a reason to facade it through another
  module.
- Do not use inline `import('module').Type` syntax for type annotations;
  always import types at the top of the file (`import type { Type }`).
- Refactor from architectural correctness, not minimal diff size. Necessary
  structural changes are encouraged even when they touch many files. Mitigate
  risk by adding tests before refactoring, not by avoiding the refactor.

Skill rules reviewers cite: `server-no-shared-module-state`,
`server-cache-react`, `bundle-analyzable-paths`, `bundle-dynamic-imports`,
`rendering-resource-hints`, `rerender-memo`.
