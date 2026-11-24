# @kobato/pack

Build and release tooling for the single-executable distribution: the SEA pipeline, the build-time Vite plugins, the
out-of-process instance driver, and the binary-suite entry scripts. Nothing here ships inside the product binary.

- `src/sea/` — the SEA pipeline (asset discovery/embedding, injection, smoke/probe) and the binary-suite entry scripts
  (`e2e.ts`, `browser.ts`).
- `src/vite/` — every build-time plugin and config helper behind `apps/kobato/vite.config.ts`: app define tables,
  dev-server `optimizeDeps`, the sanitize engine alias, the React Compiler transform, and the route-warmup manifest
  writer; `check-bundle.ts` derives its defined-globals table from `seaAppDefines`.
- `src/instance/` — the out-of-process instance driver behind `sea:smoke` / `sea:e2e` / `sea:browser` and `trace:smoke`:
  boot, seed, and stop a real kobato process. `src/instance/client/` is the suite-facing half and the ONLY part test
  trees import; the lifecycle modules next to it are for CLI entry scripts (see "Instance driver").
- `playwright.config.ts` — the real-browser journey runner config (the journeys live in `apps/kobato/tests/browser/`),
  at this package root so its imports (`@playwright/test`, `@kobato/pack/instance/client/browser-env`) resolve from this
  package's `node_modules`; `browser.ts` spawns `pnpm --filter @kobato/pack exec playwright test` and only boots
  instances, drives the browser, and reports.
- `vite.config.ts` — the SEA bundle config behind the `SEA_BUNDLE` loop in `src/sea/build.ts` (`server.mjs`,
  `process-worker.mjs`, `smoke-worker.mjs`). `root` is pinned to the repository root through `repoRoot`, so the entry
  paths and `outDir` stay workspace-relative wherever the file lives. `build.ts` passes it explicitly with `--config`
  (an absolute path anchored on `import.meta.dirname`); a bare `vite` run from this package directory auto-discovers it
  and fails fast unless `SEA_BUNDLE` names a bundle.
- `src/release.ts` — version sync and release preparation (`release:bump` / `release:prepare-next` / `release:tag` /
  `version:sync`).
- Build-time configs import the plugins through `@kobato/pack/sea/*` and `@kobato/pack/vite/*`; the one relative import
  left is the build-output entry (`src/sea/server-entry.ts`).
- `src/vite/` plugins are BUILD code: only a `vite.config.ts` (or a test of the plugin) may import them — a product
  `src/` module never does, and they never move back into `packages/server/src/infra/`. `route-warmup.ts` reads the
  manifest contract from `@kobato/distribution/warmup-manifest` and the wire constants from
  `@kobato/distribution/route-warmup`, and resolves the browser entry through `import.meta.url` (never `process.cwd()`).

## Runtime shape

The production server ships as a Node.js SEA (Node **26**, `"useVfs": true`): blob assets mount as a read-only VFS, the
injected ESM `main` runs from the mount root, every asset key maps 1:1 to a VFS path under `import.meta.dirname`. Raw
assets are `node:fs` reads via `seaAssetPath`; migrations keep the `drizzle/` VFS key prefix. Only the zstd-packed
`natives/*` ride the `node:sea` getAsset channel and extract to a flat cache dir on first run — `dlopen` needs real
files.

- Worker threads can neither start from nor see VFS paths (`ENOTDIR`) — the `eval:true` worker dispatch stays.
- Addons with companion libraries (sharp+libvips, duckdb+libduckdb) fail `ERR_DLOPEN_FAILED` from the private temp image
  — extraction stays.
- The blob stores assets uncompressed — only `natives/*` is packed (zstd level 9 multithreaded, the ONLY codec;
  `manifest.json` rides raw as the codec/integrity registry).
- Async `fs.readv`/`fs.writev` crash on ANY fd under a mount — `packages/server/src/infra/sea/sea-vfs-fs-patch.ts`
  replaces both, installed by `sea-cli` AND `sea-bootstrap`.
- **Node pin.** Toolchain pinned to 26.13.1; `engines` floors at `>=26.9.0`; `build.ts` gates on >= 26.10.0 (earlier
  26.x coerced a missing VFS dlopen flags argument to mode 0 — glibc rejects it, darwin tolerates it, so the linux CI
  smoke is the only detector). Capability matrix: `pnpm run sea:probe`.

## Bootstrap ordering (`mainFormat: "module"`)

No CJS prelude and no filesystem `import()` in the injected script. The entry shim (`src/sea/server-entry.ts`):

0. `zod/compile` — first, so config-graph schemas compile on first parse.
1. `sea-cli.ts` — argv: `--version`/`--help` exit zero-side-effect; `--smoke-*` probes bootstrap + run + exit.
2. `sea-bootstrap.ts` — the fs patch, then natives extraction + `KOBATO_NATIVES_DIR`; MUST complete before step 3
   (sharp's platform detection runs at module evaluation).
3. the server graph (`build/server/index.js`).

## Bundles

Vite 8 builds three bundles (`SEA_BUNDLE` loop in `src/sea/build.ts`, config `vite.config.ts`): `server.mjs` (injected
main) + `process-worker.mjs` + `smoke-worker.mjs` (embedded text assets) — minified, single-file,
`ssr.noExternal: true`. `check-bundle.ts` fails the build on leftover external specifiers or uncovered
`__APP_*__`/`__SEA_*__` identifiers. The server bundle CARRIES the OpenTelemetry SDK and must never carry the browser
RUM SDK.

## Natives

Extraction writes exactly 6 files (8 on win32) into the FLAT `<cache>/natives-<manifest-hash>/`: rpath-patched
`sharp.node` + libvips, `skia.node`, rpath-patched `duckdb.node` + libduckdb, the self-contained `font-split.node`,
win32-only `icudtl.dat` (missing = FATAL). rpath patches run at build time (`install_name_tool` / `patchelf`). sharp /
@napi-rs/canvas / @duckdb/node-api are statically imported and bundled; `redirect-native-requires.ts` rewrites their
platform `require(...)` sites to `nativeRequire` against the flat dir. `font-split.node` is staged from the workspace
build of `@kobato/font-split` (`pnpm --filter @kobato/font-split run build` must precede `sea:build`) — it carries no
companion libraries and no rpath patch, and server code reaches it only through `nativeRequire(FONT_SPLIT_ADDON_SPEC)`.

## Instance driver (`src/instance/`)

Everything that drives a kobato instance as a REAL separate process — two halves with no dependencies between them:

- **Lifecycle** (CLI entry scripts only) — `process.ts` (`pickFreePort`, `fetchManual`, `scrubbedParentEnv`,
  `watchChildExit` / `raceChildExit`), `temp.ts` (`makeTempDirs()` per-run data/cache/cwd roots, `smokeDatabases`),
  `sea-instance.ts` (the built SEA binary as an HTTP instance: `ensureBinaryExists`, `seaInstanceEnv`, `bootServer`,
  `waitForHttp`, `waitForExit`), `dev-instance.ts` (the repository DEV server: `writeDevConfig`, `bootDevServer`,
  `stopDevServer`), `seed.ts` (plain-SQL state for STOPPED instances: `seedInstalledInstance`, `relaxRateLimits`,
  `readConvergedConfig`), `suite-instance.ts` (`bootSuiteInstance` — boot, prove the 303 install gate, seed the admin +
  relaxed rate limits, restart; `stopSuiteInstance`), `analytics.ts` (`scanAccessEvents`, the DuckDB sidecar AFTER
  shutdown).
- **`client/`** (what the live-instance suites speak) — `http.ts` (`E2eClient`, the `KOBATO_E2E_*` env contract, CSRF
  extraction, real signin), `rpc.ts` (`callE2eRpc`; `path` is the camelCase structural router path — kebab-case
  `.route()` strings are OpenAPI metadata, not the RPC wire path), `browser-env.ts` (the `KOBATO_BROWSER_*` env
  contract).

`src/sea/{smoke,e2e,browser}.ts` and `@kobato/trace` compose both halves; `apps/kobato` `tests/e2e` and `tests/browser`
import `@kobato/pack/instance/client/*`.

- The driver imports only `@kobato/settings`, `@kobato/utils`, and its own modules: it drives built artifacts and
  running processes, never a source graph, and never reaches `src/sea` or `src/vite` — pinned by
  `apps/kobato/tests/arch/package-dag.test.ts`.
- The config file always lives inside the per-run temp root; config vars never come from the parent env (env > file
  would silently override the converged file); seeding only touches a STOPPED database; every boot pairs with a stop
  (`stopDevServer`, `stopSuiteInstance`) that SIGTERMs the child and removes the temp root — entry scripts call it from
  `finally`.
- Entry scripts run under plain `node` type-stripping, so every module they reach — the lifecycle half and
  `client/browser-env.ts` — stays free of non-strip TS syntax (no parameter properties, enums, or namespaces);
  `client/http.ts` and `client/rpc.ts` load under Vitest, Playwright, or `vite-node` only. Keep every module importable
  with zero side effects.

## Tests

`tests/unit/` runs under the `pack-unit` Vitest project (`tests/unit/vitest.config.ts`, node environment, spread from
`@kobato/test/vitest.base.ts`); run with `pnpm test tools/pack` — the config anchors at the REPOSITORY ROOT, so filters
resolve from there. The suites pin the SEA compression contract across the writer/reader seam
(`sea/sea-compression.test.ts`), the `check-bundle` scanner, the inline-package-data rewrite shapes against the
INSTALLED packages, the installed native platform specifiers, and the build-time plugins (`vite/`: React Compiler
gating, route-warmup tiering + manifest writer, `optimizeDeps`, define tables). Cross-package asset-key pins live in
`apps/kobato/tests/arch/`.

## Commands

- `pnpm run sea:build` → `dist-sea/kobato` (+ `.sha256`), budgeted at 250 MB (`BINARY_MAX_BYTES`). Deliberately NOT
  UPX-compressed — do not re-add. The injector requires an official **single-architecture** Node distribution; on an
  Intel Mac with the universal node, prepend a single-arch `node` to `PATH`. Injection is single-path: **`--build-sea`
  is the only injector** — no postject, no codesign on darwin.
- `pnpm run sea:smoke [binary]` — deep managed smoke: budget, version, probes, natives + flat layout, worker pool,
  boot + migrations on temp DBs, install gate, SSR, config convergence + reduced-env restart, calendar, DuckDB
  round-trip, SIGTERM ×2, cache reuse ×2. `--external <url>` runs only HTTP checks; `--binary-only` the service-free
  ones.
- `pnpm run sea:probe [node-binary]` — systematic VFS capability verification; needs an official Node dist (Homebrew
  lacks the SEA fuse).
- `pnpm run sea:package rename|archive --target <target> [--deb]` — the CI release-artifact packaging. `rename` verifies
  the build checksum and renames the binary to `kobato-<target>[.exe]` (run before smoke); `archive` tars it and
  writes + re-verifies the `.tar.gz.sha256` and bare-binary `.sha256` sidecars; `--deb` (linux-x64) also runs
  `scripts/build-deb.sh` and writes the deb sidecar.
- `pnpm run sea:e2e [binary]` / `sea:browser [binary]` — the two binary suites (coverage in
  `apps/kobato/tests/AGENTS.md`). `pnpm run test:browser` runs the same journeys against `KOBATO_BROWSER_BASE_URL` when
  it is set, and otherwise boots the binary exactly like `sea:browser`.

## Delivery targets

linux-x64 / linux-arm64 / darwin-arm64 / win32-x64 / win32-arm64 via `.github/workflows/sea.yml` (one `build` matrix
job; platform detail lives in `sea:package`); every leg runs the full managed smoke, the Linux legs also e2e + browser;
linux-x64 also packages `kobato_<version>_amd64.deb`. develop pushes and PRs run only `build-develop`; `ci.yml`
additionally gates PRs with `sea:build` + `sea:browser`. After `release-upload` publishes the release it deletes the
run's Actions artifacts — the release assets are the durable copy. On Windows the binary is `kobato.exe`, the natives
cache defaults to `%LOCALAPPDATA%\kobato`, and there is no SIGTERM (service deployments wrap with WinSW/NSSM).

## Self-update & rollback

Bare-metal SEA deployments self-update from the admin shell; the pipeline lives in
`packages/server/src/domains/update/`. The restart MUST close the listen socket before spawning the detached
replacement. Gate: `isSea()`, linux x64/arm64, not containerized, writable binary directory, non-`-dev` build. Manual
rollback: `kobato rollback && systemctl restart <service>`; `kobato doctor [--json]` prints aggregated diagnostics.
