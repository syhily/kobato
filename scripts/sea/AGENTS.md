# SEA packaging conventions

The production server ships as a Node.js single executable (SEA). Build-side code lives in `scripts/sea/`; the runtime modules (`src/server/infra/sea*.ts`, `native-require.ts`) are covered by `src/server/infra/AGENTS.md`.

## Runtime shape

Node **26** with **`"useVfs": true`** (26.9): blob assets mount as a read-only VFS, the injected ESM `main` (`mainFormat: "module"`) runs from the mount root, and every asset key maps 1:1 to a VFS path under `import.meta.dirname`. Raw assets (client build, drizzle migrations, wasm, worker code, libvips metadata) are plain `node:fs` reads via `seaAssetPath` (`src/server/infra/sea.ts`); only the zstd-packed `natives/*` ride the `node:sea` getAsset channel (`getEmbeddedAsset`, `src/server/infra/sea-natives.ts`) and extract to a flat cache dir on first run — `dlopen` needs real files.

## Empirically pinned constraints

`pnpm run sea:probe`; rationale in ADR-0004 amendments 2026-09-21 / 2026-10-16 / 2026-11-05.

- Worker threads can neither start from nor even see VFS paths (`ENOTDIR`) — the `eval:true` worker dispatch stays: the main thread `readFileSync`s the worker bundle from the mount and dispatches with `execArgv: ['--input-type=module']` + `argv` forwarded (workers do not inherit argv; the module flag keeps `import.meta.url` a file: URL).
- A self-contained `.node` (skia) requires from the VFS; addons with companion libraries (sharp+libvips, duckdb+libduckdb) fail `ERR_DLOPEN_FAILED` from the private temp image — extraction stays.
- The userland `node:vfs` module is NOT compiled into a SEA (`ERR_UNKNOWN_BUILTIN_MODULE`).
- The blob stores assets uncompressed — only `natives/*` is packed (`shouldPackAsset` in `scripts/sea/assets.ts`), zstd level 9 multithreaded, the ONLY codec. `manifest.json` rides raw as the codec/integrity registry; `getEmbeddedAsset` decodes lazily per key and also works inside workers.
- Async `fs.readv`/`fs.writev` crash on ANY fd under a mount (`TypeError: h.writev is not a function`; unfixed upstream) — `src/server/infra/sea-vfs-fs-patch.ts` replaces both with sequential fallbacks, installed by `sea-cli` before its flag dispatch AND by `sea-bootstrap` before the server graph.
- A VFS `process.dlopen` wrapper bug (a missing flags argument coerced to dlopen mode 0, which glibc rejects) broke every main-thread native load of a linux SEA; fixed upstream in Node 26.10.0 (nodejs/node#65909), the runtime guard is retired, and `scripts/sea/build.ts` gates the build on >= 26.10.0 (darwin's dyld tolerates mode 0 — the linux CI smoke is the only detector).

**Node 26 pin.** Toolchain pinned to 26.13.0 (`.nvmrc`, CI matrices); `package.json` engines floors at `>=26.9.0` (first `useVfs`-capable release); the SEA build gates on >= 26.10.0 (26.9 lacks the dlopen fix); local dev/tests run the machine's default Node.

## Bootstrap ordering (`mainFormat: "module"`)

No CJS prelude and no filesystem `import()` in the injected script, so the whole server graph is one static import graph evaluated depth-first. The entry shim (`scripts/sea/server-entry.ts`):

0. `zod/compile` — Zod 4.5 global auto-compilation, first so the config-graph schemas compile on first parse (the browser bundle keeps `jitless`; `src/entry.server.tsx` has the same first line).
1. `src/server/infra/sea-cli.ts` — argv: `--version`/`--help` exit with zero side effects; `--smoke-natives` / `--smoke-worker` / `--smoke-vfs` / `--smoke-intl` bootstrap + run + exit. Only `--smoke-worker` needs the full configuration (the pool graph pulls in `@/server/infra/config` — validates, never connects). `--smoke-intl` is a PURE Intl probe (`src/server/infra/intl-probe.ts`, imports only the locale contract plus the shared display formatter `@/shared/i18n/format`, never the config/server graph): it asserts `supportedLocalesOf` plus real `DateTimeFormat` / `RelativeTimeFormat` / `DisplayNames` / `PluralRules` / `ListFormat` / `Collator` and production `formatDuration` output for all four UI locales, with no config or database.
2. `src/server/infra/sea-bootstrap.ts` — the fs patch, then natives extraction + `KOBATO_NATIVES_DIR`; MUST complete before step 3 (sharp's platform detection runs at module evaluation).
3. the server graph (`build/server/index.js`).

## Bundles

Vite 8 builds three bundles (`vite.sea.config.ts`, the `SEA_BUNDLE` loop in `scripts/sea/build.ts`): `server.mjs` (the injected main), `process-worker.mjs` + `smoke-worker.mjs` (embedded text assets) — minified, single-file, `ssr.noExternal: true`. `scripts/sea/check-bundle.ts` fails the build on leftover external specifiers or uncovered `__APP_*__`/`__SEA_*__` identifiers.

## Natives

Dynamic libraries + one datafile. Extraction writes exactly 5 files (7 on win32) into the FLAT `<cache>/natives-<manifest-hash>/`: the rpath-patched `sharp.node` + libvips (win32 splits it into two DLLs), `skia.node`, the rpath-patched `duckdb.node` + libduckdb, and win32-only `icudtl.dat` (missing = FATAL on the first paragraph build). rpath patches run at build time (`install_name_tool` on darwin, `patchelf` on linux). sharp / @napi-rs/canvas / @duckdb/node-api are **statically imported and bundled**; `scripts/sea/redirect-native-requires.ts` (a Vite plugin) rewrites their platform-specifier `require(...)` sites to `nativeRequire(...)` against the flat dir + embedded `natives-meta/*` (`src/server/infra/native-require.ts`). jsdom's module-scope sync-XHR worker-path resolve cannot survive the single-file bundle, so `scripts/sea/inline-package-data.ts` stubs it (call-site shapes pinned by `tests/unit/shared/contracts/inline-package-data.test.ts`).

## Commands

- `pnpm run sea:build` → `dist-sea/kobato` (+ `.sha256`), budgeted at 230 MB. Deliberately NOT UPX-compressed (phdr/sentinel-fuse failures) — do not re-add. The injector requires an official **single-architecture** Node distribution: a universal/multi-arch binary carries one SEA sentinel per slice and `node --build-sea` rejects it. `scripts/sea/inject.ts` preflights both the missing-fuse and multi-fuse cases. On an Intel Mac with the universal `/usr/local/bin/node`, run the build with the downloaded `node-v26.13.0-darwin-x64/bin/node` (prepend it to `PATH`).
- `pnpm run sea:smoke [binary]` — deep managed smoke: budget, version, `--smoke-vfs`, `--smoke-intl` (four-locale ICU data, config-free), natives + flat layout, worker pool, boot + migrations on per-run temp DBs, fresh-install gate, SSR, embedded asset, config-file convergence + a reduced-env restart proving the converged file alone boots, calendar endpoint, page views → DuckDB round-trip, SIGTERM ×2, natives-cache reuse ×2. `--external <url>` runs only the HTTP checks against a live server; `--binary-only` the service-free ones (`--smoke-intl` included).
- `pnpm run sea:probe [node-binary]` — systematic VFS capability verification (`scripts/sea/vfs-capabilities.ts`): userland `node:vfs` probes plus a purpose-built `useVfs` mini-SEA asserting the in-binary behavior matrix above. Needs an official Node dist — Homebrew lacks the SEA fuse (preflighted).
- `pnpm run sea:e2e [binary]` — boots the binary (seeded admin) and runs `tests/e2e` over real HTTP: signin, public pages/feed/sitemap, the four-locale representation journey (language switch → HTML/feed/Atom/manifest/calendar + conditional ETags), admin create→render→delete, backup/restore round-trip. Linux CI runs it after `sea:smoke`.
- `pnpm run sea:browser [binary]` — boots the binary (seeded admin, per-run temp files) and runs the real-Chromium Playwright journeys in `tests/browser`: dirty-card flush veto, successful switch + clean hydration, two-tab sparse save (B never writes the locale), a non-settings editor keeping its unsaved state with an explicit notice, the public comment composer loading only the active locale's label chunk, and `contentLanguage` body `lang`/`dir`. Local runs use the system Google Chrome channel; CI installs Playwright's Chromium and sets `KOBATO_BROWSER_CHANNEL=chromium`. `pnpm run test:browser` runs the same suite against a managed boot or `KOBATO_BROWSER_BASE_URL`.
- Injection is single-path (`scripts/sea/inject.ts`): **`--build-sea` is the only injector** — no postject, no codesign on darwin (the build re-signs ad-hoc itself), the binary sanity-checked with `--version`.

## Delivery targets

linux-x64 / linux-arm64 / darwin-arm64 / win32-x64 / win32-arm64 via `.github/workflows/sea.yml`; every matrix job runs the full managed smoke, the Linux jobs also `sea:e2e` and (after `pnpm exec playwright install --with-deps chromium`) `sea:browser`. develop pushes and PRs run only `build-develop` (linux-x64 build + smoke + e2e + browser). `.github/workflows/ci.yml` additionally gates **pull requests**: its `build` job runs `sea:build` + bundled Chromium + `sea:browser` (plain pushes there keep the non-SEA production build).

**Windows:** the binary is `kobato.exe`; the build spawns through cmd (`shell: true`); the natives cache defaults to `%LOCALAPPDATA%\kobato`; no SIGTERM — shutdown relies on SIGINT/SIGHUP/SIGBREAK (`src/server/infra/lifecycle.ts`), so service deployments wrap the binary with WinSW/NSSM (stop = Ctrl+C).

## Self-update & rollback

Bare-metal SEA deployments can self-update from the admin shell. The pipeline lives in `src/server/domains/update/`: download the release asset, verify against `.sha256`, swap the binary, restart. The restart (`job.ts::scheduleSelfRestart`) MUST close the listen socket (idempotent `closeHttpServer`) before spawning the detached replacement — spawning first races the child's bind against the parent still holding the port and strands bare-metal deployments on EADDRINUSE (audit P0-7). The gate requires: `isSea()`, linux x64/arm64, not containerized, writable binary directory, non-`-dev` build. Admin procedures: `admin.update.check` / `admin.update.apply` / `admin.update.status`.

Manual rollback: `kobato rollback && systemctl restart <service>` (the CLI subcommand in `src/server/infra/sea-cli.ts` swaps the `.bak` sibling back via `src/server/infra/binary-rollback.ts`; the restart is left to the service manager). `kobato doctor [--json]` prints an aggregated diagnostic (version, natives smoke, config validation via a child-process probe, self-update readiness) and exits 1 when natives or config fail; the gate lives in `src/server/infra/self-update-gate.ts`.
