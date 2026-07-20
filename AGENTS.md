# Project conventions

Repository conventions for AI agents and contributors.

## Quick orientation

- React Router 8 Framework Mode with SSR (`appDirectory: 'src'`).
- React 19 TSX/TS only.
- Postgres + Redis.
- Path alias `@/*` → `./src/*`.
- Five layers under `src/`: `routes/` (orchestration), `server/` (SSR),
  `client/` (browser), `ui/` (components), `shared/` (isomorphic).

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
| tier 2 admin  | Dashboard, posts, settings, etc.          | Idle warmup (only for authenticated admins)   |
| tier 2 editor | Editor shells                             | Idle warmup (only for admins)                 |
| tier 2 auth   | Signin, setup                             | Idle warmup (all visitors)                    |

The plugin runs in the SSR `writeBundle` hook (after both client and server
builds finish), reads the React Router client manifest from
`build/client/assets/manifest-*.js`, and writes
`build/client/assets/warmup-manifest.json`.

At request time, `src/server/render/warmup/manifest.ts` re-reads the client
manifest, matches the request pathname with `matchRoutes`, and emits the
critical preloads for the matched route and its ancestor layouts. This keeps
the first-screen preload tight instead of widening it with unrelated routes.

**Key files:**

| File                                          | Role                                            |
| --------------------------------------------- | ----------------------------------------------- |
| `src/shared/route-warmup/manifest.ts`         | File-contract owner — parse, validate, collect  |
| `src/server/infra/route-warmup.ts`            | Vite plugin — manifest generation               |
| `src/server/render/warmup/manifest.ts`        | Server-side manifest reader + route matcher     |
| `src/client/components/RouteWarmupScript.tsx` | Presentational — renders idle-warmup `<script>` |
| `src/root.tsx`                                | Layout wires critical links + tier-2 script     |

**Exclusion rules:** Heavy lazy-only chunks are excluded from both critical
and idle preloads (`canvas-*`, `ImageEditorCanvas-*`, `qrcode*`, `player-*`).
`editor-tiptap-*` is allowed only in the editor idle tier. Shiki grammar
chunks are excluded (not in any route's `imports` array). Chunks > 100 KB are
excluded from idle warmup. The idle script respects
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
  deliberately NOT UPX-compressed. Verified dead ends (UPX 5.2.0, linux
  x64): inject-then-compress fails with `CantPackException: bad e_phoff`
  (postject relocates the phdrs, [postject#87](https://github.com/nodejs/postject/issues/87));
  `--force-execve` fails with `UnknownExecutableFormatException`;
  compress-then-inject fails because UPX destroys the sentinel fuse.
  Runtime-side it could never work anyway: Node finds the blob via
  `dl_iterate_phdr` on the in-memory phdrs (a `NODE_SEA_BLOB` PT_NOTE),
  which a packed stub does not present. Do not re-add an UPX step.
- `pnpm run sea:smoke [binary]` — 17-check deep smoke: version, natives,
  a per-run `kobato_smoke_<rand>` database (created on the same Postgres
  server, dropped in cleanup — the shared `test` DB is never touched),
  `--smoke-worker` (a real sharp job round-tripping through the
  `worker_threads` image pool), boot + migrations, fresh-install gate,
  SSR, embedded asset, SQL seed (one minimal admin row plus the
  `blog.general` / `blog.assets` settings roots — hydration backfills the
  rest), a graceful restart (the settings snapshot only loads at boot;
  the install gate itself is evaluated per request), installed `/health`
  and `/` SSR, the @napi-rs/canvas calendar endpoint over HTTP, SIGTERM
  ×2, and natives-cache reuse ×2. `--external <url>` runs only the HTTP
  checks against an already-running server (e.g. a container), seeds
  nothing, and reports the calendar check as SKIP on uninstalled
  instances.
- Binary CLI flags: `--version`, `--help`, `--smoke-natives`,
  `--smoke-worker`. The first three need zero environment; the last one
  requires the full server env (DATABASE_URL, REDIS_URL, SESSION_SECRET,
  ENCRYPTION_KEY, DATA_PATH) because the pool graph pulls in
  `@/server/infra/env` at import time — it validates but never connects.
- Delivery targets are linux-x64 / linux-arm64, built by
  `.github/workflows/sea.yml`. Local macOS builds work for verification
  but are not a delivery target; they need an official Node.js 24
  distribution — Homebrew's node lacks the SEA sentinel fuse
  (`scripts/sea/inject.ts` preflights this). An official tarball is
  cached under the gitignored `tmp/`.

Runtime rules for contributors:

- NEVER statically value-import `sharp`, `sharp-ico`, or
  `@napi-rs/canvas` — always `requireExternal` from `@/server/infra/sea`
  (`import type` stays legal). Enforced by a boundaries contract test
  (`tests/unit/shared/contracts/boundaries.test.ts`).
- Runtime file reads that must work under SEA go through
  `getEmbeddedAsset` / `listEmbeddedAssetKeys`. New resource types must
  be added to `scripts/sea/assets.ts` AND read via the sea helpers with
  a non-SEA fallback.
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
the release asset (`kobato-linux-<arch>`, 512 MB cap), verify against the
`.sha256` sidecar, `chmod 0o755`, rename the live binary to
`<binary>.bak`, swap, then restart (detached re-spawn + `process.exit(0)`).
Any failure after the backup step restores the `.bak` best-effort before
rethrowing; the stage dir is always cleaned.

The gate (`gate.ts`) requires ALL of: `isSea()`, linux x64/arm64, not
containerized (`/.dockerenv` / `/proc/1/cgroup`), a writable binary
directory, and a non-`-dev` build. Refusals surface as Chinese admin-facing
strings in `reasons` — Docker deployments are refused by design (upgrade by
pulling a new image). Never bypass the gate from a new caller.

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
   `kobato-linux-*` binaries to the release).
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
dynamic library** belong in `package.json`'s `dependencies`. The current
entries are the canonical examples:

- `@napi-rs/canvas`, `sharp` — native binaries fetched per platform.

Every other dependency belongs in `devDependencies`, even if the server or
client bundle imports it in production. The production Docker image ships a
SEA single executable (see `Dockerfile` and `scripts/sea/`): the build
stage runs `pnpm install --frozen-lockfile` with the full dev dependencies,
bundles the whole server into the binary, and the runtime stage contains
only that binary — no node runtime, no node_modules, and no second
`pnpm install --prod` (that two-stage install was the pre-SEA rationale,
see commit `ed83a5a`). The convention still holds because the SEA assets
collector (`scripts/sea/assets.ts`) embeds each native package's installed
dependency closure from the build stage's node_modules, so native packages
must stay in `dependencies` to be installed with their platform binaries
at build time.

Examples: `react`, `hono`, `drizzle-orm`, `ioredis`, `nodemailer`,
`sanitize-html`, `feed`, `pg`, `bcryptjs`, `dompurify`, `fast-xml-parser` —
all `devDependencies`, despite being production imports. Only the native
runtime deps go in `dependencies`.

## Settings autosave

`/admin/settings` saves per-card, not per-form. Every card is a
`useSettingsCard` instance backed by `useSettingsMutation.commit(section, payload)`.
The save trigger model is **blur-driven, not debounce-driven** — there is no
`onChange` autosave anywhere.

**Three triggers, each wired to a specific control type:**

| Control                                 | Trigger       | When it fires                      |
| --------------------------------------- | ------------- | ---------------------------------- |
| Text `<Input>` / `<Textarea>`           | `flushOnBlur` | Input loses focus; no-op if clean  |
| Switch / RadioGroup / Select / Combobox | `save`        | `onChange`, immediately            |
| List append/remove/move                 | none          | Relies on the next blur or a flush |

In addition, three framework-level flushes call every registered card via
`SettingsFlushProvider`: close button + ESC (`flushAll`), scroll-away
(`IntersectionObserver` → `flushSection(id)`), and page hide
(`visibilitychange` / `pagehide` → `flushAll`).

**Adding / editing a settings card — the rules:**

1. Destructure the trigger you need from `useSettingsCard()`:
   - text input → `flushOnBlur`
   - switch/select/radio → `save` (never call `save` from a text input)
   - you usually don't need `flush` directly (the framework owns it)
2. Render text inputs through `<SettingsInput flushOnBlur={flushOnBlur} {...form.register('x')}>`
   — **never** bare `<Input>`. The wrapper merges RHF's onBlur with
   `flushOnBlur`; spreading `register` first would clobber it. For multi-line
   controlled fields use `<SettingsTextarea flushOnBlur={flushOnBlur}>`.
3. Every `<Select>` / `<RadioGroup>` / `<Combobox>` `onValueChange` MUST call
   `save()` after `field.onChange(...)` — there is no debounce to catch it.
   Audit with `rg 'onValueChange=\{field.onChange\}' src/ui/admin/settings/`.
4. List append/remove/move buttons MUST NOT call `save()` — they leave the
   form dirty and the next blur/flush commits the whole list. Calling
   `save()` on append would filter empty rows in `fromState`, shrink the
   payload, trigger a revalidate, and (before the reseed guard) wipe the
   row the user just added.
5. Don't destructure `flushOnBlur` in a card that has no text input —
   `no-unused-vars` is enforced.

**Reseed guard (do not remove):** `useSettingsCard` only re-seeds the form
from a new `source` prop when the form is **clean** (`getValues()` deep-equals
`lastCommitted`). When the user has un-blurred edits, a concurrent
`revalidator.revalidate()` (from another card's save) produces a fresh
`source` reference but the card keeps the user's input. Removing this guard
re-introduces the "empty row disappears" bug. The trade-off is accepted: a
remote concurrent edit to the same section won't surface until the local
edit is committed.

**No `debounceMs` option** — it was removed. Don't re-add onChange
auto-save; the whole point of the rework is that typing never fires a
request.

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
- List edits (append/remove/move) stay dirty-form commits as today — the
  whole list is one array field and replaces the stored array on save.
- `useSettingsCard`'s `display` is a local optimistic projection
  (`mergeSectionPatch(source, patch)`) for masks/font families only; it
  is never POSTed.
- `src/shared/config/merge-section-patch.ts` is the single merge
  implementation — server write base and client display projection share
  it. Do not fork it.

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
