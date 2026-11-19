# `@kobato/pack`

Packaging tooling for the single-executable distribution. Nothing here ships inside the product binary.

- `src/sea/` — the SEA pipeline (asset discovery/embedding, injection, smoke/probe/e2e, self-update).
- `src/release.ts` — version sync and release preparation used by `release:bump` / `release:prepare-next`.
- Build-time configs import the plugins through `@kobato/pack/sea/*`; the one relative import left is the build-output entry (`src/sea/server-entry.ts`).

## Runtime shape

The production server ships as a Node.js SEA (Node **26**, `"useVfs": true`): blob assets mount as a read-only VFS, the injected ESM `main` runs from the mount root, and every asset key maps 1:1 to a VFS path under `import.meta.dirname`. Raw assets (client build, db migrations, wasm, worker code, libvips metadata) are plain `node:fs` reads via `seaAssetPath`; migrations keep the stable `drizzle/` VFS key prefix. Only the zstd-packed `natives/*` ride the `node:sea` getAsset channel (`getEmbeddedAsset`) and extract to a flat cache dir on first run — `dlopen` needs real files.

## Pinned constraints

- Worker threads can neither start from nor even see VFS paths (`ENOTDIR`) — the `eval:true` worker dispatch stays: the main thread reads the worker bundle from the mount and dispatches with `execArgv: ['--input-type=module']` + `argv` forwarded.
- Addons with companion libraries (sharp+libvips, duckdb+libduckdb) fail `ERR_DLOPEN_FAILED` from the private temp image — extraction stays. The userland `node:vfs` module is NOT compiled into a SEA.
- The blob stores assets uncompressed — only `natives/*` is packed (`shouldPackAsset` in `src/sea/assets.ts`), zstd level 9 multithreaded, the ONLY codec; `manifest.json` rides raw as the codec/integrity registry.
- Async `fs.readv`/`fs.writev` crash on ANY fd under a mount (unfixed upstream) — `packages/server/src/infra/sea/sea-vfs-fs-patch.ts` replaces both with sequential fallbacks, installed by `sea-cli` AND `sea-bootstrap`.
- **Node pin.** Toolchain pinned to 26.13.1 (`.nvmrc`, CI matrices); `engines` floors at `>=26.9.0` (first `useVfs`-capable release); `build.ts` gates on >= 26.10.0 — earlier 26.x coerced a missing VFS dlopen flags argument to mode 0, which glibc rejects (darwin tolerates it, so the linux CI smoke is the only detector). Capability matrix: `pnpm run sea:probe`.

## Bootstrap ordering (`mainFormat: "module"`)

No CJS prelude and no filesystem `import()` in the injected script — the server graph is one static import graph evaluated depth-first. The entry shim (`src/sea/server-entry.ts`):

0. `zod/compile` — first, so the config-graph schemas compile on first parse.
1. `sea-cli.ts` — argv: `--version`/`--help` exit zero-side-effect; `--smoke-*` probes bootstrap + run + exit (`--smoke-intl` is a PURE Intl probe importing only the locale contract + the shared display formatter).
2. `sea-bootstrap.ts` — the fs patch, then natives extraction + `KOBATO_NATIVES_DIR`; MUST complete before step 3 (sharp's platform detection runs at module evaluation).
3. the server graph (`build/server/index.js`).

## Bundles

Vite 8 builds three bundles (`SEA_BUNDLE` loop in `src/sea/build.ts`): `server.mjs` (the injected main) + `process-worker.mjs` + `smoke-worker.mjs` (embedded text assets) — minified, single-file, `ssr.noExternal: true`. `check-bundle.ts` fails the build on leftover external specifiers or uncovered `__APP_*__`/`__SEA_*__` identifiers. The server bundle CARRIES the OpenTelemetry SDK and must never carry the browser RUM SDK (the client-only `@openobserve/` marker fails the check).

## Natives

Extraction writes exactly 5 files (7 on win32) into the FLAT `<cache>/natives-<manifest-hash>/`: rpath-patched `sharp.node` + libvips, `skia.node`, rpath-patched `duckdb.node` + libduckdb, win32-only `icudtl.dat` (missing = FATAL on the first paragraph build). rpath patches run at build time (`install_name_tool` / `patchelf`). sharp / @napi-rs/canvas / @duckdb/node-api are statically imported and bundled; `redirect-native-requires.ts` rewrites their platform `require(...)` sites to `nativeRequire` against the flat dir. jsdom's sync-XHR worker-path resolve is stubbed by `inline-package-data.ts`.

## Instance harness

The out-of-process instance lifecycle behind `sea:smoke` / `sea:e2e` / `sea:browser` lives in `@kobato/harness`. `tools/pack` keeps the build/inject/budget/bundle-check pipeline and the entry scripts only — it must not grow new instance-lifecycle code; extend the harness instead (never the reverse: the harness must not depend on pack).

## Commands

- `pnpm run sea:build` → `dist-sea/kobato` (+ `.sha256`), budgeted at 230 MB (`BINARY_MAX_BYTES` in `src/sea/budget.ts`). Deliberately NOT UPX-compressed (phdr/sentinel-fuse failures) — do not re-add. The injector requires an official **single-architecture** Node distribution (`inject.ts` preflights the missing-fuse and multi-fuse cases); on an Intel Mac with the universal `/usr/local/bin/node`, prepend the downloaded single-arch `node` to `PATH`. Injection is single-path: **`--build-sea` is the only injector** — no postject, no codesign on darwin.
- `pnpm run sea:smoke [binary]` — deep managed smoke: budget, version, probes, natives + flat layout, worker pool, boot + migrations on per-run temp DBs, install gate, SSR, config convergence + reduced-env restart, calendar, page views → DuckDB round-trip, SIGTERM ×2, cache reuse ×2. `--external <url>` runs only HTTP checks; `--binary-only` the service-free ones.
- `pnpm run sea:probe [node-binary]` — systematic VFS capability verification; needs an official Node dist (Homebrew lacks the SEA fuse).
- `pnpm run sea:e2e [binary]` / `sea:browser [binary]` — the two binary suites (see `apps/kobato/tests/AGENTS.md` for their coverage).

## Delivery targets

linux-x64 / linux-arm64 / darwin-arm64 / win32-x64 / win32-arm64 via `.github/workflows/sea.yml`; every matrix job runs the full managed smoke, the Linux jobs also e2e + browser. The linux-x64 artifact also packages `kobato_<version>_amd64.deb`. develop pushes and PRs run only `build-develop`; `ci.yml` additionally gates PRs with `sea:build` + `sea:browser`. On Windows the binary is `kobato.exe`, the natives cache defaults to `%LOCALAPPDATA%\kobato`, and there is no SIGTERM (shutdown relies on SIGINT/SIGHUP/SIGBREAK; service deployments wrap with WinSW/NSSM).

## Self-update & rollback

Bare-metal SEA deployments can self-update from the admin shell. The pipeline lives in `packages/server/src/domains/update/`: download the release asset, verify against `.sha256`, swap the binary, restart. The restart (`job.ts::scheduleSelfRestart`) MUST close the listen socket before spawning the detached replacement — spawning first strands bare-metal deployments on EADDRINUSE. Gate: `isSea()`, linux x64/arm64, not containerized, writable binary directory, non-`-dev` build. Manual rollback: `kobato rollback && systemctl restart <service>`. `kobato doctor [--json]` prints aggregated diagnostics and exits 1 when natives or config fail.
