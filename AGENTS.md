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

The production server also ships as a Node.js single executable (SEA) on
**Node 26**: the single-file ESM server bundle is the binary's injected
`main` (`mainFormat: "module"`); client assets, drizzle migrations, wasm,
worker code, and libvips metadata are embedded in the blob and read from
memory (`src/server/infra/sea.ts`). Only the native dynamic libraries are
extracted to a flat cache dir on first run
(`src/server/infra/sea-natives.ts`) — the OS `dlopen` needs real files.

**Node 26 pin.** `scripts/sea/build.ts` gates `REQUIRED_NODE_MAJOR = 26`;
the CI matrices (`.github/workflows/sea.yml` ×3, `ci.yml` ×2) pin
`node-version: 26`; the Dockerfile builds on `node:26-bookworm-slim` with
`npm install -g pnpm@11.9.0` (Node 25+ images ship no Corepack — keep the
version aligned with the `packageManager` field). Local dev/tests still
run on the machine's default Node; only `sea:build` gates.

**Bootstrap ordering (`mainFormat: "module"`).** There is no CJS prelude
and no runtime bundle materialization — and filesystem `import()` is
forbidden in the injected script, so the whole server graph is one static
import graph evaluated depth-first in import order. The entry shim
(`scripts/sea/server-entry.ts`) sequences it:

1. `src/server/infra/sea-cli.ts` — argv handling: `--version`/`--help`
   exit with zero side effects; `--smoke-natives` / `--smoke-worker`
   bootstrap + run + exit.
2. `src/server/infra/sea-bootstrap.ts` — `bootstrapSeaRuntime()` at
   module scope: natives extraction + `KOBATO_NATIVES_DIR`. It MUST
   complete before step 3 because sharp's platform detection runs at
   module-evaluation time.
3. the server graph (`build/server/index.js`).

`--smoke-worker` dispatches the embedded `worker/smoke-worker.mjs` text
via `new Worker(code, { eval: true, execArgv: ['--input-type=module'], argv: process.argv.slice(2) })` —
the `--input-type=module` runs the eval'd bundle as ESM explicitly (the
eval route keeps `import.meta.url` a file: URL, which the inlined
packages' module-scope `createRequire(import.meta.url)` needs); the
`argv` forward matters because worker threads do NOT inherit the
parent's argv, and the worker's env graph resolves the config file from
`--config`.

**Vite 8 builds the three bundles** (`vite.sea.config.ts`, driven by the
`SEA_BUNDLE` loop in `scripts/sea/build.ts`): `server.mjs` (the
injected main), `process-worker.mjs` and `smoke-worker.mjs` (embedded
as text assets) — all ESM. tsdown is gone; the bundles are minified,
single-file (`codeSplitting: false`), `ssr.noExternal: true`.
`scripts/sea/check-bundle.ts` fails the build on leftover external
specifiers (including rolldown's `__require("bare")` runtime-external
shim).

**Payload compression.** `scripts/sea/assets.ts` packs every asset above
1 KB (zstd-19 by default, brotli-11 for release builds —
`pnpm run sea:build --codec brotli`, wired into the Dockerfile and all
three sea.yml jobs; local builds stay zstd) into
`dist-sea/intermediates/packed/<key>`. `manifest.json` rides uncompressed
as the codec registry (`{key, path, sha256(raw), codec, size}`);
`getEmbeddedAsset` parses it once and decodes lazily, memoized per key.
The smoke budgets the binary at 190 MB — `--build-sea` leaves no
standalone blob, so the compressed payload is sized inside the binary.

**Natives = dynamic libraries ONLY.** The extraction writes exactly 3
files (4 on win32) into the FLAT `<cache>/natives-<manifest-hash>/` dir:
the rpath-patched sharp addon (`sharp.node`), the libvips files (one
`libvips-cpp.*` on darwin/linux; win32 splits libvips into two DLLs
inside the sharp platform package), and the skia addon (`skia.node`).
The rpath patch runs at build time on a staged copy
(`install_name_tool -change @rpath/X @loader_path/X` on darwin,
`patchelf --set-rpath '$ORIGIN'` on linux — patchelf is in the Dockerfile
build stage and guarded in the linux CI job; nothing on win32). sharp /
sharp-ico / @napi-rs/canvas are **statically imported and bundled**;
`scripts/sea/redirect-native-requires.ts` (a Vite plugin) rewrites the
packages' own platform-specifier `require(...)` call sites to
`nativeRequire(...)`, which resolves them against the flat dir plus
embedded `natives-meta/*` metadata assets
(`src/server/infra/native-require.ts`).

- `pnpm run sea:build` → `dist-sea/kobato` (+ `.sha256`). The binary is
  deliberately NOT UPX-compressed — every ordering is a verified dead
  end, re-verified against `--build-sea` output on Node 26.5.0
  (UPX 5.2.0, linux x64): inject-then-compress fails with
  `CantPackException: bad e_phoff` (Node's injector writes phdrs UPX
  can't parse — the same failure class as
  [postject#87](https://github.com/nodejs/postject/issues/87));
  `--force-execve` fails with `UnknownExecutableFormatException`;
  compress-then-inject destroys the sentinel fuse so `--build-sea`
  refuses; and Node finds the blob via `dl_iterate_phdr` on the in-memory
  phdrs, which a packed stub does not present. Do not re-add an UPX step.
- `pnpm run sea:smoke [binary]` — 20-check deep smoke: binary budget, version, natives, the flat 3-file extraction layout,
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
  `--binary-only [binary]` runs just the service-free checks (budget,
  version, natives, layout, worker pool) — the mode the macOS and
  Windows CI targets use (neither can host the Postgres
  service container).
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
- Injection is single-path (`scripts/sea/inject.ts`): **`--build-sea` is
  the only injector** — it regenerates the blob itself from the
  sea-config (whose `output` is the final binary), does NOT codesign on
  darwin (the build does the remove + ad-hoc re-sign itself), and the
  produced binary is sanity-checked with `--version` inline. postject was
  retired together with the darwin-x64 target (the only platform where
  `--build-sea` segfaulted on 26.5.0, #63466-class).
- Delivery targets are linux-x64 / linux-arm64 / darwin-arm64 /
  win32-x64 / win32-arm64, built by
  `.github/workflows/sea.yml`. The deep managed smoke stays Linux-only;
  the darwin and win32 matrix jobs run `--binary-only`. The darwin jobs
  need the `shasum -a 256` spelling (macOS has no `sha256sum`); the
  win32 jobs run the rename/package steps under Git Bash (`shell: bash`)
  and ship `kobato.exe`. Local macOS builds need an official Node.js 26
  distribution — Homebrew's node lacks the SEA sentinel fuse
  (`scripts/sea/inject.ts` preflights this).
- Windows runtime notes: the binary is `kobato.exe` (no extension →
  refuses to execute); the build spawns everything through cmd
  (`shell: true` in `scripts/sea/exec.ts`) because pnpm's `.bin` entries
  are `.cmd` shims there. The natives cache
  defaults to `%LOCALAPPDATA%\kobato` (`resolveCacheDir`). Windows
  delivers no SIGTERM — graceful shutdown relies on SIGINT (Ctrl+C),
  SIGHUP (console window closed), and SIGBREAK (Ctrl+Break), all
  registered in `src/server/infra/lifecycle.ts`; service deployments
  should wrap the binary with WinSW/NSSM, whose stop action sends
  Ctrl+C into that same path. `taskkill /F` (TerminateProcess) can
  never be graceful, on any platform level.

Runtime rules:

- Native packages (sharp, sharp-ico, @napi-rs/canvas) are statically
  imported like any other dependency — the bundler inlines them and the
  redirect plugin rewrites their platform loads. The inverted hazard is
  the OLD pattern: a `requireExternal('sharp' | ...)` call site hides the
  package from the bundler and crashes under SEA. Enforcement: the
  boundaries contract test bans native `requireExternal(...)` call sites
  and pins the plugin's existence (`tests/unit/shared/contracts/
boundaries.test.ts`), and the native-specifiers contract test
  enumerates every platform `require` in the installed packages so a
  future sharp/canvas release introducing a new specifier fails at
  upgrade time (`tests/unit/shared/contracts/
native-specifiers.test.ts`). `requireExternal` remains only as
  `nativeRequire`'s resolver (absolute `.node` paths under SEA, regular
  node_modules resolution outside it).
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
the historical musl blocker (a postject `.gnu.hash` corruption bug) is
gone with postject, but musl stays unverified for SEA injection (see the
comment at the top of `Dockerfile`).

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
build stage installs their platform binaries — the SEA pipeline bundles
their JS into the server/worker bundles and embeds the platform `.node` /
libvips library files (`scripts/sea/assets.ts`).

Examples: `react`, `hono`, `drizzle-orm`, `nodemailer`,
`sanitize-html`, `feed`, `pg`, `bcryptjs`, `dompurify`, `fast-xml-parser` —
all `devDependencies`, despite being production imports.

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
