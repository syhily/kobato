# Project conventions

Repository conventions for AI agents and contributors.

## Quick orientation

- React Router 8 Framework Mode with SSR (`appDirectory: 'src'`), React 19 TSX/TS only, SQLite (node:sqlite) + a DuckDB analytics sidecar.
- Path alias `@/*` → `./src/*`.
- Five layers under `src/`: `routes/` (orchestration), `server/` (SSR), `client/` (browser), `ui/` (components), `shared/` (isomorphic) — plus `src/inkling/`, the self-contained Lexical editor layer.

## Config file

Infrastructure configuration lives in `kobato.config.json` — auto-created with defaults when missing. `src/server/infra/config.ts`'s `CONFIG_TABLE` maps nested config paths to Zod schemas; consumers read the validated `serverConfig` export. Env var names are derived by convention (`path.join('__')` → `storage__database`).

- Location order: `--config <path>` → SEA `<execDir>/kobato.config.json` → `./kobato.config.json` → `~/.config/kobato.config.json`. First existing wins.
- Precedence: schema defaults < config file < env vars. Env values differing from the file are written back (coerced to native JSON types only when the entry's schema accepts the coercion — a numeric-looking secret stays a string). `security.trustedProxies` rejects `0.0.0.0/0` (it would trust proxy headers from any peer, disabling every per-IP rate limit).
- `VITEST=true` without `--config` → env-only, zero filesystem access.
- Tooling that spawns the binary MUST pass `--config <tempDir>/…` to avoid persisting throwaway config next to the binary.
- Adding a config value: add a `CONFIG_TABLE` row → update `kobato.config.example.json` → cover it in `tests/unit/server/infra/config.test.ts`.

## Subdirectory conventions

Claude loads these additively as it moves through the codebase:

| File                    | Scope                                                              |
| ----------------------- | ------------------------------------------------------------------ |
| `src/routes/AGENTS.md`  | Route modules, loaders, actions, React Router conventions          |
| `src/server/AGENTS.md`  | Server layers (infra, domains, http, render), API procedures, auth |
| `src/client/AGENTS.md`  | Browser hooks, oRPC client, React.lazy patterns                    |
| `src/ui/AGENTS.md`      | Pure-props components, shadcn, PT renderer, component architecture |
| `src/styles/AGENTS.md`  | Tailwind tokens, design-system CSS, `@theme` conventions           |
| `src/shared/AGENTS.md`  | Isomorphic modules, Zod contracts, DTOs, PT schema                 |
| `src/inkling/AGENTS.md` | The Lexical editor layer: card pipeline, headless surface, labels  |
| `tests/AGENTS.md`       | Test utilities, naming conventions, coverage rules                 |

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

A Vite plugin splits ~500 client chunks into tiers so the browser proactively loads high-priority routes. At request time, `src/server/render/warmup/manifest.ts` matches the pathname against the route tree and emits critical `<link rel="modulepreload">` for the matched route and its ancestor layouts; idle tiers preload lower-priority chunks via inline `<script>`.

Tier-2 buckets derive automatically from route-ID prefixes (`routes/public|admin|editor|auth/*`) in `src/server/infra/route-warmup.ts` — adding or removing routes in `src/routes.ts` needs no warmup edits. Only `TIER1_ROUTES` is editorial. A contract test in `tests/unit/server/infra/route-warmup.test.ts` pins every declared route to exactly one bucket.

## SEA packaging

The production server also ships as a Node.js single executable (SEA) on
**Node 26** with **`"useVfs": true`** (26.9): blob assets mount as a
read-only VFS, the injected ESM `main` (`mainFormat: "module"`) runs from
the mount root, and every asset key maps 1:1 to a VFS path under
`import.meta.dirname`. Raw assets (client build, drizzle migrations,
wasm, worker code, libvips metadata) are plain `node:fs` reads via
`seaAssetPath` (`src/server/infra/sea.ts`); only the zstd-packed
`natives/*` ride the `node:sea` getAsset channel (`getEmbeddedAsset`,
`src/server/infra/sea-natives.ts`) and extract to a flat cache dir on
first run — `dlopen` needs real files.

Empirically pinned constraints (`pnpm run sea:probe`; rationale in
ADR-0004 amendments 2026-09-21 / 2026-10-16 / 2026-11-05):

- Worker threads can neither start from nor even see VFS paths
  (`ENOTDIR`) — the `eval:true` worker dispatch stays: the main thread
  `readFileSync`s the worker bundle from the mount and dispatches with
  `execArgv: ['--input-type=module']` + `argv` forwarded (workers do not
  inherit argv; the module flag keeps `import.meta.url` a file: URL).
- A self-contained `.node` (skia) requires from the VFS; addons with
  companion libraries (sharp+libvips, duckdb+libduckdb) fail
  `ERR_DLOPEN_FAILED` from the private temp image — extraction stays.
- The userland `node:vfs` module is NOT compiled into a SEA
  (`ERR_UNKNOWN_BUILTIN_MODULE`).
- The blob stores assets uncompressed — only `natives/*` is packed
  (`shouldPackAsset` in `scripts/sea/assets.ts`), zstd level 9
  multithreaded, the ONLY codec. `manifest.json` rides raw as the
  codec/integrity registry; `getEmbeddedAsset` decodes lazily per key
  and also works inside workers.
- Async `fs.readv`/`fs.writev` crash on ANY fd under a mount
  (`TypeError: h.writev is not a function`; unfixed upstream) —
  `src/server/infra/sea-vfs-fs-patch.ts` replaces both with sequential
  fallbacks, installed by `sea-cli` before its flag dispatch AND by
  `sea-bootstrap` before the server graph.
- A VFS `process.dlopen` wrapper bug (a missing flags argument coerced
  to dlopen mode 0, which glibc rejects) broke every main-thread native
  load of a linux SEA; fixed upstream in Node 26.10.0
  (nodejs/node#65909), the runtime guard is retired, and
  `scripts/sea/build.ts` gates the build on >= 26.10.0 (darwin's dyld
  tolerates mode 0 — the linux CI smoke is the only detector).

**Node 26 pin.** Toolchain pinned to 26.13.0 (`.nvmrc`, CI matrices);
`package.json` engines floors at `>=26.9.0` (first `useVfs`-capable
release); the SEA build gates on >= 26.10.0 (26.9 lacks the dlopen
fix); local dev/tests run the machine's default Node.

**Bootstrap ordering (`mainFormat: "module"`).** No CJS prelude and no
filesystem `import()` in the injected script, so the whole server graph
is one static import graph evaluated depth-first. The entry shim
(`scripts/sea/server-entry.ts`):

0. `zod/compile` — Zod 4.5 global auto-compilation, first so the
   config-graph schemas compile on first parse (the browser bundle keeps
   `jitless`; `src/entry.server.tsx` has the same first line).
1. `src/server/infra/sea-cli.ts` — argv: `--version`/`--help` exit with
   zero side effects; `--smoke-natives` / `--smoke-worker` /
   `--smoke-vfs` bootstrap + run + exit. Only `--smoke-worker` needs
   the full configuration (the pool graph pulls in
   `@/server/infra/config` — validates, never connects).
2. `src/server/infra/sea-bootstrap.ts` — the fs patch, then natives
   extraction + `KOBATO_NATIVES_DIR`; MUST complete before step 3
   (sharp's platform detection runs at module evaluation).
3. the server graph (`build/server/index.js`).

**Vite 8 builds three bundles** (`vite.sea.config.ts`, the `SEA_BUNDLE`
loop in `scripts/sea/build.ts`): `server.mjs` (the injected main),
`process-worker.mjs` + `smoke-worker.mjs` (embedded text assets) —
minified, single-file, `ssr.noExternal: true`.
`scripts/sea/check-bundle.ts` fails the build on leftover external
specifiers or uncovered `__APP_*__`/`__SEA_*__` identifiers.

**Natives = dynamic libraries + one datafile.** Extraction writes
exactly 5 files (7 on win32) into the FLAT
`<cache>/natives-<manifest-hash>/`: the rpath-patched `sharp.node` +
libvips (win32 splits it into two DLLs), `skia.node`, the rpath-patched
`duckdb.node` + libduckdb, and win32-only `icudtl.dat` (missing = FATAL
on the first paragraph build). rpath patches run at build time
(`install_name_tool` on darwin, `patchelf` on linux). sharp /
@napi-rs/canvas / @duckdb/node-api are **statically imported and
bundled**; `scripts/sea/redirect-native-requires.ts` (a Vite plugin)
rewrites their platform-specifier `require(...)` sites to
`nativeRequire(...)` against the flat dir + embedded `natives-meta/*`
(`src/server/infra/native-require.ts`). jsdom's module-scope sync-XHR
worker-path resolve cannot survive the single-file bundle, so
`scripts/sea/inline-package-data.ts` stubs it (call-site shapes pinned
by `tests/unit/shared/contracts/inline-package-data.test.ts`).

- `pnpm run sea:build` → `dist-sea/kobato` (+ `.sha256`), budgeted at
  230 MB. Deliberately NOT UPX-compressed (phdr/sentinel-fuse failures)
  — do not re-add.
- `pnpm run sea:smoke [binary]` — deep managed smoke: budget, version,
  `--smoke-vfs`, natives + flat layout, worker pool, boot + migrations
  on per-run temp DBs, fresh-install gate, SSR, embedded asset,
  config-file convergence + a reduced-env restart proving the converged
  file alone boots, calendar endpoint, page views → DuckDB round-trip,
  SIGTERM ×2, natives-cache reuse ×2. `--external <url>` runs only the
  HTTP checks against a live server; `--binary-only` the service-free
  ones.
- `pnpm run sea:probe [node-binary]` — systematic VFS capability
  verification (`scripts/sea/vfs-capabilities.ts`): userland `node:vfs`
  probes plus a purpose-built `useVfs` mini-SEA asserting the in-binary
  behavior matrix above. Needs an official Node dist — Homebrew lacks
  the SEA fuse (preflighted).
- `pnpm run sea:e2e [binary]` — boots the binary (seeded admin) and
  runs `tests/e2e` over real HTTP: signin, public pages/feed/sitemap,
  admin create→render→delete, backup/restore round-trip. Linux CI runs
  it after `sea:smoke`.
- Injection is single-path (`scripts/sea/inject.ts`): **`--build-sea` is
  the only injector** — no postject, no codesign on darwin (the build
  re-signs ad-hoc itself), the binary sanity-checked with `--version`.
- Delivery targets linux-x64 / linux-arm64 / darwin-arm64 / win32-x64 /
  win32-arm64 via `.github/workflows/sea.yml`; every matrix job runs the
  full managed smoke, the Linux jobs also `sea:e2e`. develop pushes and
  PRs run only `build-develop` (linux-x64 build + smoke + e2e).
- Windows: the binary is `kobato.exe`; the build spawns through cmd
  (`shell: true`); the natives cache defaults to `%LOCALAPPDATA%\kobato`;
  no SIGTERM — shutdown relies on SIGINT/SIGHUP/SIGBREAK
  (`src/server/infra/lifecycle.ts`), so service deployments wrap the
  binary with WinSW/NSSM (stop = Ctrl+C).

Runtime rules:

- Native packages (sharp, @napi-rs/canvas, @duckdb/node-api) are
  statically imported like any other dependency — the bundler inlines
  them and the redirect plugin rewrites their platform loads. The
  inverted hazard is the OLD pattern: a `requireExternal('sharp' | ...)`
  call site hides the package from the bundler and crashes under SEA.
  Enforcement: the boundaries contract test bans native
  `requireExternal(...)` sites, and the native-specifiers test
  enumerates every platform `require` in the installed packages so a
  new specifier fails at upgrade time. `requireExternal` remains only
  as `nativeRequire`'s resolver.
- Runtime file reads that must work under SEA go through `seaAssetPath`
  (raw assets, main thread only) or `getEmbeddedAsset` (packed
  `natives/*` + `natives-meta/*` — the worker-safe channel). Never
  `seaAssetPath` a `natives/*` key (it throws — zstd bytes). New
  resource types go into `scripts/sea/assets.ts` AND are read via the
  sea helpers with a non-SEA fallback.
- Embedded asset keys are owned by `src/shared/sea/assets.ts` — new keys
  go there; never hardcode one in `scripts/` or `src/server/`
  (`tests/unit/shared/contracts/sea-assets.test.ts`).
- `KOBATO_NATIVES_DIR` / `KOBATO_CACHE_DIR` are runtime env vars read
  outside `config.ts`: the SEA runtime modules read them before the
  validated `serverConfig` snapshot exists (allowlisted in the
  boundaries test).

### SEA self-update

Bare-metal SEA deployments can self-update from the admin shell. The pipeline lives in `src/server/domains/update/`: download the release asset, verify against `.sha256`, swap the binary, restart. The restart (`job.ts::scheduleSelfRestart`) MUST close the listen socket (idempotent `closeHttpServer`) before spawning the detached replacement — spawning first races the child's bind against the parent still holding the port and strands bare-metal deployments on EADDRINUSE (audit P0-7). The gate requires: `isSea()`, linux x64/arm64, not containerized, writable binary directory, non-`-dev` build. Admin procedures: `admin.update.check` / `admin.update.apply` / `admin.update.status`.

Manual rollback: `kobato rollback && systemctl restart <service>` (the CLI subcommand in `src/server/infra/sea-cli.ts` swaps the `.bak` sibling back via `src/server/infra/binary-rollback.ts`; the restart is left to the service manager). `kobato doctor [--json]` prints an aggregated diagnostic (version, natives smoke, config validation via a child-process probe, self-update readiness) and exits 1 when natives or config fail; the gate lives in `src/server/infra/self-update-gate.ts`.

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
- Streamed loader promises (a loader returning an un-awaited promise) require
  the process-level `unhandledRejection` handler in
  `src/server/infra/lifecycle.ts` — do not remove it (ADR-0005).
- Never wrap the whole app (or any SSR-critical DOM that must match between
  server and client) in a lazy `<Suspense>` boundary whose fallback differs
  from the resolved content — on a cold visit the chunk is still loading at
  hydration time and the whole tree mismatches (React error #418). Use the
  hydration-safe `useSyncExternalStore` gate (`LazyMotionConfig` in
  `src/ui/components/lazy-motion.tsx`), or import eagerly. The same rule
  applies to hydration-enhancement mount points in the projected `body_html`:
  the static fallback must mirror the enhanced component's initial render
  (the music-player card's `musicPlayerFallbackHtml` ⇔ `MusicPlayerCard`
  paused state, parity-pinned by
  `tests/unit/ui/public/music-player/music-player.test.tsx`).
- Motion Only for JS-driven animation: everything goes through the
  `@/ui/components/lazy-motion` facade (`LazyMotion*` /
  `LazyAnimatePresence` / `LazyMotionConfig`) — never a direct runtime
  `motion/react` import outside that module (one shared lazy chunk, one
  hydration-safe fallback), and never React `<ViewTransition>` /
  `addTransitionType` / `document.startViewTransition` for element or
  navigation animation (named captures paint in the `::view-transition`
  overlay above every z-index; the theme-switch wipe in
  `src/ui/lib/ThemeProvider.tsx` is the sole `startViewTransition`
  consumer). Shared easing/duration constants live in
  `@/client/lib/motion`; simple hover/state styling stays on CSS
  `transition-*` utilities.

`src/assets/scripts` is intentionally absent. All interactivity lives in React hooks/components under `src/client/` and `src/ui/`.

## Dependencies

Every version number lives in the root `pnpm-workspace.yaml` `catalog:` table — the root `package.json` references entries as `"catalog:"`. `taze` edits the catalog in place. Version-exact pins (drizzle rc, the Lexical `0.46.0` family) stay exact inside the catalog.

Only packages that are **required at production runtime AND ship a native
dynamic library** belong in `package.json`'s `dependencies`:

- `@napi-rs/canvas`, `sharp` — native binaries fetched per platform.
- `@duckdb/node-api` — the DuckDB analytics engine (`duckdb.node` +
  libduckdb fetched per platform).

Every other dependency belongs in `devDependencies`, even if the server or
client bundle imports it in production. Distribution ships only a SEA
binary built on CI: the build runs `pnpm install --frozen-lockfile` with
the full dev dependencies and bundles the server — no node runtime, no
node_modules, no second `pnpm install --prod` (pre-SEA rationale, see
commit `ed83a5a`). Native packages must stay in `dependencies` so the
build installs their platform binaries — the SEA pipeline bundles their
JS and embeds the platform `.node` / libvips library files
(`scripts/sea/assets.ts`).

Examples: `react`, `hono`, `drizzle-orm`, `nodemailer`,
`feed`, `pg`, `bcryptjs`, `dompurify`, `fast-xml-parser` —
all `devDependencies`, despite being production imports.

**Version pins to watch.** `drizzle-orm` / `drizzle-kit` are pinned at
`1.0.0-rc.5` (pre-release). Watch the drizzle 1.0 stable release; when it
ships, evaluate upgrading the pair together and re-run the migration
contract tests before unpinning.

## Settings autosave

`/admin/settings` saves per-card via `useSettingsCard` backed by `useSettingsMutation.commit(section, payload)`. The save model is **blur-driven** — typing never fires a request. The save response is authoritative: the card adopts it as its new baseline without refetching.

Controls trigger saves differently:

| Control                       | Trigger       | When it fires                      |
| ----------------------------- | ------------- | ---------------------------------- |
| Text `<Input>` / `<Textarea>` | `flushOnBlur` | Input loses focus; no-op if clean  |
| Switch / Select / Combobox    | `save`        | `onChange`, immediately            |
| List append/remove/move       | none          | Relies on the next blur or a flush |

Framework-level flushes (close, ESC, scroll-away, page hide) call every registered card via `SettingsFlushProvider`.

Adding a settings card:

1. Use `useSettingsCard()` — destructure `flushOnBlur` for text inputs, `save` for switches/selects.
2. Text inputs: render through `<SettingsInput flushOnBlur={flushOnBlur} {...form.register('x')}>` — never bare `<Input>`. Multi-line: `<SettingsTextarea>`; secrets: `<SettingsSecretInput>`.
3. Switch/select/combobox: render through the wrapper components in `src/ui/admin/settings/shell/` with `save={save}` — never hand-roll `onValueChange`.
4. List buttons MUST NOT call `save()` — let the next blur/flush commit the whole list.
5. `useSettingsCard` re-seeds the form only when clean and `toState(source)` differs from current form values — prevents lost edits and focus drops.

Each card POSTs an honest Section patch (owned fields only). The server deep-merges, validates, and writes only that row. `src/shared/config/merge-section-patch.ts` is the single merge implementation.

## Storage configuration & migration

S3-compatible storage is configured on `/admin/settings` in the 存储配置 (assets) section — `StorageCards` (`src/ui/admin/settings/StorageCards.tsx`) carries 当前存储 / 存储迁移 / 资源域名 / S3 兼容存储; the section's own `AssetsForm` adds upload limits + robots.txt. The rules:

- First-time saves of `assets.storage.*` are connectivity-probed (`validateS3Config`, HeadBucket + ListObjectsV2 fallback) before persisting; an unreachable/invalid config rejects with BAD_REQUEST. The probe's raw SDK error stays in the server log; the admin sees a fixed message.
- Write-path URL rules live OUTSIDE `assetsSchema` (hydration shares it and must keep reading a legacy `http://` endpoint row): `assetsWriteSchema` on the section's `writeSchema` slot (consumed only by the admin write path in `services/core.ts`) requires an `https://` endpoint and restricts `urlTemplate` to an https full-URL carrying `{src}` or a scheme-less relative suffix — the migration-target input in `storage.controller.ts` shares the same predicates (`isSafeStorageEndpoint` / `isSafeStorageUrlTemplate`).
- Once `storage.enabled` is true the config is LOCKED: `updateBlogSettingsSection` rejects `storage.*` patches unless the caller passes `{ allowStorageConfigOverride: true }` — reserved for the migration task. ONE exemption: a patch changing only `accessKeyId` / `secretAccessKey` / `urlTemplate` (credential rotation, CDN template) is allowed while locked; like every allowed S3 change, it is connectivity-probed on the merged config before persisting. All other storage.* changes require a migration.
- Every backend switch (enable S3, change bucket/provider, fall back to local) runs through the migration task in `src/server/domains/storage/s3-migration.ts`: copy ALL objects (listing-driven, cursor-checkpointed in the `storage_migration` singleton row) → flip config + driver columns → catch-up passes. Cancellable, resumable. Admin procedures: `admin.storage.migrationStatus` / `startMigration` / `cancelMigration` / `resumeMigration`. The status wire shape is the zod contract in `src/shared/contracts/storage.ts`.
- A completed migration records a final source/target consistency verification (object counts + total bytes, `verification` JSON column; passes when the target covers the source) and the admin UI shows both sides with a match/mismatch indicator.
- Migration targets that differ from the live settings use `createS3BackendFromConfig` — never the settings-driven singleton.
- Key policy lives in ONE module, `src/server/infra/storage/key-policy.ts`: extension → Content-Type, key-prefix → cache visibility (`backup/`/`branding/`/`audit-log/` are private), and the visibility → Cache-Control mapping. The `/storage/*` + `/fonts/embedded/*` serving routes, the S3 adapter's write-time header defaults, and the migration all read from it — never keep a local copy. Migration copies propagate the source object's stored Content-Type/Cache-Control verbatim via `getStreamWithMeta`; only a source that cannot report headers (local FS) falls back to the key-policy defaults carried as `visibility` on `putStream`.

Asset URLs are site-owned: content stores origin-relative `/storage/<key>` references, and `resolveAssetUrl` (`src/server/infra/storage/public-url.ts`) emits `${siteIdentity.website}/storage/<key>` (plus a `?v=<updatedAt>` cache-buster when given) for BOTH drivers — never the CDN base. The URL → key inverse is `parseAssetUrl` in the same module; both directions share the path grammar (`/storage/<key>`, `/fonts/embedded/<hash>/<file>`) owned by `src/shared/types/asset-url.ts` — never re-implement a fragment of it. When S3 is the primary driver, the first-party `/storage/*` and `/fonts/embedded/*` routes 302 (Cache-Control `public, max-age=300`, query preserved) to `getPublicBaseUrl()` via `s3StorageRedirect` (`src/server/http/resources/storage-redirect.ts`). The CDN transform template (`assets.storage.urlTemplate`) is applied AT THAT BOUNDARY, not in the browser: clients signal transform intent with `w`/`h`/`q` query params on the site-owned URL (`siteOwnedStorageSrc` in `src/shared/types/images.ts`), and the redirect substitutes them while preserving unrelated params — without a template the params are ignored. Boundaries that must be absolute (feeds, OG meta) absolutize origin-relative srcs while computing the saved `bodyHtmlFeed` projection (`absolutizeAssetSrcForFeed` in `src/shared/lexical/cards/card-html.ts`). A one-time backfill (`src/server/domains/content/services/asset-url-backfill.ts`) rewrites legacy CDN-absolute/relative references in content bodies and cover/poster columns to `/storage/<key>` (changed Lexical rows re-derive the three projection columns so the saved `bodyHtml` drops the old host); it runs once at boot (flag `system.asset-url-backfill`, written only on a zero-skip run so a partial run retries; serialized ahead of the PT→Lexical boot backfill) and again after each completed storage migration.

`s3-migration.ts` is a Platform domain and imports no Core/Feature domain (only the same-stratum audit recorder): its cross-domain collaborators (settings flip, branding drivers, image-meta cache invalidation, post-switch backfill) are injected through `wireS3Migration` at the composition root (`src/server/bootstrap/db-lifecycle.ts`); the settings lock probe flows the reverse way, injected into `updateBlogSettingsSection` by the settings controller as `isStorageMigrationActive`.

## Backup & restore

The archive is a gzipped tar of three payloads: `kobato.db` (content), `analytics.duckdb` (analytics sidecar), and the env-converged `kobato.config.json`. Sidecars from pre-rewrite backups carry the legacy named-column `access_log` schema — the boot-time blob migration (`src/server/domains/analytics/services/blob-migration.ts`, flag `system.analytics-blob-migration`) converts them to `access_events` on the first boot after the restore.

- Optional password encryption (settings `backup.encryption` — enabling REQUIRES a stored password: the section schema rejects `enabled` without one and the create path fails closed via `BackupEncryptionMisconfiguredError`; per-run override on manual creates, min 8 chars) streams the archive through chunked AES-256-GCM (`src/server/domains/backup/services/crypto.ts`: scrypt-derived key, `KOBENC01` magic). Each record is `[u32 ctLen][1B flags][12B IV][ct][16B tag]` with AAD = seq‖flags — reordering/truncation/forged-length attacks fail authentication (a declared length over the 4 MiB chunk size is rejected before any read); bit0 flags FINAL, exactly one per stream. `BackupDecryptionError.kind` splits failures: `'auth'` (GCM tag check — retryable) vs `'format'` (header/framing/truncation — no retry helps). Encrypted archives carry a `.enc` storage suffix — that suffix, not a stream probe, is how `listBackups` / `isBackupEncrypted` / the download route know.
- The encryption password resolver reaches the backup domain through `wireBackupEncryption` at the composition root (Platform domains must not import settings); `resetBackupEncryption` is the test seam; `resolveStoredEncryptionPassword()` in `services/backup.ts` is the single reader. Passwords are TRIMMED on both the create and restore paths.
- Restore applies the three payloads IN ORDER — content DB → analytics sidecar (skipped on the setup flow) → config file. The staged config is validated during staging AND again before the first swap against the same checks the next boot applies (`parseRestorableConfigJson`: `parseConfigFileJson`'s legacy-key migration + `''`-as-unset + strict file schema, PLUS the env-over-file merged per-entry parse — the file schema alone is all-optional, so a config missing a required secret would pass and then `process.exit(1)` on the next boot, databases already swapped): a config the next boot would reject aborts with a 400 and no swap. The config leg then overwrites the live file (takes effect on the next restart; skipped in env-only mode); its write failure stays warn-only — never rolls back the completed engine swaps.
- Swap crash consistency: the engine swaps' two renames are not atomic, so boot runs `recoverPreRestoreFiles()` BEFORE the engines open — target missing + `.pre-restore` present = mid-swap crash, the sibling (last good copy) is renamed back; target present = stale sibling dropped; `.restore-staging` orphans always dropped. The config file joins the same `.pre-restore` machinery (`restoreTargets()` = engine files + config; its replace is a single rename with no missing-target window). Before every restore, `discardSwapLeftovers()` removes stale leftovers STRICTLY (a failed delete aborts the restore — a leftover would let a later failure roll back to a ghost database).
- Wrong passwords surface as `BackupPasswordError` (400, `services/restore.ts`) — never a 500; the stored-backup restore controller catches `EncryptedBackupPasswordRequired`, discards the staged dir, and answers `{passwordRequired: true}`. Every restore path passes `onFailureFn` so a pre-swap drain/prepare failure sweeps the staged dir.
- Encrypted uploads restore in two steps: `upload-restore` stages the raw bytes, detects the magic, parks the temp dir in `pending-uploads.ts` (10-minute token, max 4 parked, LRU eviction never touches an in-flight entry, all-busy park → 429) and answers `{encrypted, token}`; the UI prompts and calls `upload-restore/decrypt` (IP rate limit, 64 KB body limit, per-token in-flight mutex → 409, unknown/expired token → 410, structural staging failures → 410 with the token released, wrong password → 400 with the token kept). The setup flow has no two-step prompt — the password rides along as a form field, and its gate checks (installed/session/token/CSRF) run BEFORE the rate limiter so anonymous requests never burn the 5/hour budget. The stored settings password is tried first for stored-backup restores; a decrypt failure declines into the same prompt. Restores audit `backup_restored`, downloads `backup_downloaded`.
- Progress: the browser uploads via XHR (the only API with real upload percent) and polls from the start; pre-claim decrypt/extract byte progress merges with the restore machine's phases in `restore-progress.ts` behind `GET /api/admin/backup/restore-progress`.
- The global 30s request timeout exempts the long-running restore endpoints (`/api/admin/backup/upload-restore*`, `/api/setup/restore` get a 30-minute budget) — 500 MB over a slow uplink would otherwise 503 mid-staging.

## Layering

- `server/*` → `shared/*`, `server/*`. Not `client/*` or `ui/*`.
- `client/*`, `ui/*` → `shared/*`, `ui/*`, `client/*`. Not `server/*`.
- `shared/*` → `shared/*` only.
- `inkling/*` → `inkling/*` only (host-agnostic editor island). The rest of
  the app imports it ONLY through two entry surfaces: `@/inkling` (the React
  barrel, client/ui/routes) and `@/inkling/headless` (react-free; the ONLY
  surface `server/*` and `shared/*` may use). Pinned by the boundaries test.
- `routes/*` wire only: extract request context, call orchestrators, render. No DB imports or business logic inline.
- Cross-domain imports under `server/domains/` must stay acyclic (DAG, pinned by contract test).
- No barrel `index.ts` files. No `export { X } from 'y'` re-exports — import directly from the source module. (`src/inkling/` is the deliberate exception: its barrel IS the public surface.)
- Refactor from architectural correctness, not minimal diff size.
