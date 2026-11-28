# @kobato/pack

Build and release tooling for the two-binary SEA distribution (`dist-sea/kobato` and `dist-sea/sayaka`, both from
`pnpm run sea:build`): the SEA pipeline, the build-time Vite plugins, and the binary-suite entry scripts, which compose
the instance driver and the Playwright support that live in `@kobato/instance` (`tools/instance/AGENTS.md`). Nothing
here ships inside the product binaries.

- `src/sea/` — the SEA pipeline (asset discovery/embedding, injection, smoke/probe) and the binary-suite entry scripts
  (`e2e.ts`, `browser.ts`). `sayaka-entry.ts` and `server-entry.ts` are the two injected mains (one per binary);
  sayaka's injected-entry bootstrap lives here too (`sayaka-sea-cli.ts` + `sayaka-sea-vfs-fs-patch.ts`), imported by
  `sayaka-entry.ts` through the tools-internal relative specifier so the pipeline holds no dependency on the sayaka app;
  `src/release.ts` — version sync and release preparation (`release:bump` / `release:prepare-next` / `release:tag` /
  `version:sync`).
- `src/vite/` — every build-time plugin and config helper behind the apps' vite configs: app define tables, dev-server
  `optimizeDeps`, the sanitize engine alias, the React Compiler transform, and the route-warmup manifest writer
  (`routeWarmupPlugin({ warmupEntry, tier1Routes?, tier2Prefixes? })` is the public site's plugin — sayaka passes its
  idle-script entry and tiers; the entry is required and nothing defaults to an app path; `tier2Prefixes` is one flat
  prefix list, the manifest is `{ version, tier1, tier2 }`, `deriveTier2RouteIds(manifest)` returns that one list, and
  the idle cap keys chunk sizes on the hrefs the manifest carries, so a base prefix cannot hide an oversized chunk).
  `check-bundle.ts` derives its defined-globals table from `seaAppDefines`. `src/vite/app-metadata.ts`'s
  `readAppPackage(appDir)` reads any app's package metadata (default `apps/kobato`, the version source of truth — the
  workspace build defines its `__APP_*__` globals from it too) so the helpers can serve the sayaka build too;
  `appOptimizeDeps(appDir)` reads the dependency table of the named app (`apps/kobato`, the workspace dev server — the
  one config that enables `optimizeDeps`; no default): an entry the app declares stays bare, one it does not declare is
  attributed `owner > entry` to the first of its declared dependencies whose table declares it, and one no declared
  dependency declares is omitted — Vite pre-bundles only what the served app's root can resolve, and an unresolvable
  include is a per-entry warning at dev boot. `src/vite/react-router-hono-server.ts` is sayaka's `reactRouterHonoServer`
  Vite plugin — every request is served through its Hono app. `src/vite/hono-dev-host.ts` is the backend's dev host
  (`honoDevHost({ entry })`: `@hono/vite-dev-server` with the node adapter and no client-script injection, used by
  `apps/kobato/vite.backend.config.ts` to load `src/server.ts` on `serve` — the same file is the backend bundle on
  `build`) and owns the three pieces both plugins share: the `globalThis` slot keyed by
  `Symbol.for('kobato.vite-dev-server')` (`VITE_DEV_SERVER_SLOT`, `exposeViteDevServer`), the `x-remote-*`
  request-header middleware, and `forceDevMode`. Each app keeps an app-side `dev-server-ref.ts` that reads the slot,
  because product `src/` never imports a tools package. The backend host additionally marks the process as a dev host
  (`markDevHost`, the `globalThis` slot keyed by `Symbol.for('kobato.server.dev-host')`) before the entry loads, and
  drops Vite's own `--config <vite config>` / `-c` from `process.argv` (`withoutViteConfigFlag`): the kobato server
  reads that same flag for `kobato.config.json` (`packages/server/src/infra/config-arg`), so under the dev host the
  server must fall through to `KOBATO_CONFIG_FILE` or the cwd default instead of parsing the Vite config as JSON;
  `@kobato/server/infra/dev-host-state` reads that marker (its own copy of the key — same technique as
  `dev-server-ref.ts`) and keeps the server graph's run-once state there across re-evaluations. Both dev hosts load
  their entry through `@hono/vite-dev-server`, i.e. Vite's `ssrLoadModule` compat runner (`hmr: false`): neither app's
  server graph has an `import.meta.hot`, so neither entry keeps an `accept()` boundary, nothing under
  `packages/server/src` reads one (`apps/kobato/tests/arch/server-layers.test.ts`), and a server-side edit simply
  re-evaluates on the next request. `src/vite/front-end-config.ts` is the one front-end config factory both React Router
  configs call:
  `frontEndConfig({ appDir, port, identityDir?, base?, plugins?, server?, optimizeDeps?, serverEntry?, ssrExternals? })`
  returns the config function — the shared plugin list (`sanitizeEngineAliasPlugin`, `inlinePackageDataPlugin`,
  `reactCompilerPlugin`, `reactRouter()`, `tailwindcss()`) with the application's own plugins around it
  (`plugins.leading` ahead of it, `plugins.trailing` after it), the `__APP_*__` defines from
  `readAppPackage(identityDir)` (default `apps/kobato`), the client/root chunk-size limits (2500/500),
  `resolve.tsconfigPaths`, the route warmup `clientFiles`, and `server.port`; `optimizeDeps` adds
  `appOptimizeDeps(appDir)`, `serverEntry` adds the SSR environment build on `build`, `ssrExternals` the build-only
  `ssr.external`. `apps/kobato/vite.config.ts` (port 4321, the `/editor` rewrite and `svgr`, the backend proxy) and
  `apps/sayaka/vite.config.ts` (port 4322, `reactRouterHonoServer` and the route-warmup plugin) are each one call.
  `src/sea/paths.ts` anchors the workspace's client build on the repository root (`workspaceClientBuildDir()` →
  `apps/kobato/build/workspace/client`) — the same output the backend's `clientAssetsRoot()` finds beside its bundle.
- `src/sea/{smoke,e2e,browser}.ts` — the binary-suite entry scripts — boot the PAIR through `@kobato/instance`
  (`bootSuiteInstance` / `stopSuiteInstance`, `readConvergedConfig`, the DuckDB sidecar scan) and share its process
  primitives (`@kobato/instance/process`: `fail`, `sleep`, `pickFreePort`, `fetchManual`, `scrubbedParentEnv`,
  `watchChildExit` / `raceChildExit`); `sea/exec.ts` keeps only the command runners (`run`, `tryRun`) on top of them.
  `browser.ts` spawns
  `pnpm --filter @kobato/instance exec playwright test --config tools/instance/playwright.config.ts`. This package
  depends on `@kobato/instance` (and on `@kobato/test` for its own Vitest config); nothing under those two imports
  `@kobato/pack`.
- `vite.config.ts` — the SEA bundle config behind the `SEA_BUNDLE` loop in `src/sea/build.ts` (`server.mjs`,
  `process-worker.mjs`, `smoke-worker.mjs` for kobato, `sayaka-server.mjs` for sayaka — each bundle row carries its app,
  and per-app bundles land in per-app intermediates: `dist-sea/intermediates` vs `dist-sea/sayaka-intermediates`).
  `root` is pinned to the repository root through `repoRoot`; `build.ts` passes the config explicitly with `--config`
  (an absolute path anchored on `import.meta.dirname`), and a bare `vite` run from this package directory fails fast
  unless `SEA_BUNDLE` names a bundle. Both bundles resolve everything through package exports and relative paths: the
  sayaka entry graph is the entry file plus sayaka's BUILT server graph, whose `@sayaka/*` aliases were already resolved
  by the app's own build, so neither bundle needs `resolve.tsconfigPaths`; the sayaka bundle runs without the
  native-require redirect plugin (sayaka embeds no natives and must never gain the `@kobato/server` binding).
- `src/vite/` plugins are BUILD code: only a `vite.config.ts` (or a test of the plugin) may import them — never a
  product `src/` module — and they never move back into `packages/server/src/infra/`. Build-time configs import them
  through `@kobato/pack/vite/*`; the relative imports left under `src/` are the two injected mains' build-output entries
  (`src/sea/server-entry.ts` → kobato's `build/server/index.js`, `src/sea/sayaka-entry.ts` → sayaka's) and
  `sayaka-entry.ts`'s tools-internal `./sayaka-sea-cli`; the `./lib/greet.mjs` in `src/sea/vfs-capabilities.ts` is
  inside the probe script it generates, not a source import.

## Runtime shape

The production servers ship as Node.js SEAs (Node **26**, `"useVfs": true`): blob assets mount as a read-only VFS, the
injected ESM `main` runs from the mount root, and every asset key maps 1:1 to a VFS path under `import.meta.dirname`.
`dist-sea/kobato` embeds kobato's SPA (`client/`), the drizzle migrations, the observability assets, the worker bundles,
and the natives; `dist-sea/sayaka` embeds only the public-site client build (`sayaka-client/`) plus its manifest —
sayaka has no natives to extract and owns its SEA awareness in `apps/sayaka/src/server` (it may never import
`@kobato/server`). Raw assets are `node:fs` reads via `seaAssetPath`; migrations keep the `drizzle/` VFS key prefix.
Only the zstd-packed `natives/*` ride the `node:sea` getAsset channel and extract to a flat cache dir on first run —
`dlopen` needs real files.

- Worker threads can neither start from nor see VFS paths (`ENOTDIR`) — the `eval:true` worker dispatch stays.
- Addons with companion libraries (sharp+libvips, duckdb+libduckdb) fail `ERR_DLOPEN_FAILED` from the private temp image
  — extraction stays.
- The blob stores assets uncompressed; only `natives/*` is packed (zstd level 9 multithreaded, the ONLY codec;
  `manifest.json` rides raw as the codec/integrity registry).
- Async `fs.readv`/`fs.writev` crash on ANY fd under a mount — `packages/server/src/infra/sea/sea-vfs-fs-patch.ts`
  replaces both, installed by `sea-cli` AND `sea-bootstrap`; the sayaka binary installs the entry-side copy
  (`src/sea/sayaka-sea-vfs-fs-patch.ts`) from `sayaka-sea-cli`.
- **Node pin.** Toolchain pinned to 26.13.1; `engines` floors at `>= 26.9.0`; `build.ts` gates on >= 26.10.0 (earlier
  26.x coerced a missing VFS dlopen flags argument to mode 0 — glibc rejects it, darwin tolerates it, so the linux CI
  smoke is the only detector). Capability matrix: `pnpm run sea:probe`.

## Bootstrap ordering (`mainFormat: "module"`)

No CJS prelude and no filesystem `import()` in the injected script. The kobato entry shim (`src/sea/server-entry.ts`)
runs:

1. `zod/compile` — first, so config-graph schemas compile on first parse.
2. `sea-cli.ts` — argv: `--version`/`--help` exit zero-side-effect; `--smoke-*` probes bootstrap + run + exit.
3. `sea-bootstrap.ts` — the fs patch, then natives extraction + `KOBATO_NATIVES_DIR`; MUST complete before the server
   graph (sharp's platform detection runs at module evaluation).
4. the server graph (`build/server/index.js`).

The sayaka entry shim (`src/sea/sayaka-entry.ts`) runs the same shape with the pipeline-owned bootstrap: `zod/compile`,
then `src/sea/sayaka-sea-cli.ts` (fs patch + `--version`/`--help` zero-side-effect exit — no `--smoke-*`, rollback, or
doctor surface — imported through the tools-internal relative specifier, never through an app dependency), then sayaka's
built server graph. Sayaka has no step-3 native extraction.

## Bundles

Vite 8 builds four bundles (`SEA_BUNDLE` loop in `src/sea/build.ts`, config `vite.config.ts`): kobato's `server.mjs`
(injected main) + `process-worker.mjs` + `smoke-worker.mjs` (embedded text assets), and sayaka's `sayaka-server.mjs`
(injected main over sayaka's `build/server` graph) — minified, single-file, `ssr.noExternal: true`. `check-bundle.ts`
fails the build on leftover external specifiers or uncovered `__APP_*__`/`__SEA_*__` identifiers, scanning each app's
bundles against that app's define table and external allowlist: kobato allows the two `@aws-sdk/signature-*`
error-string mentions; sayaka allows `@napi-rs/canvas` — jsdom's optional canvas require survives as a runtime require
inside jsdom's own try/catch (`Canvas = null` fallback), the sanitize engine never draws, and the split smoke proves the
fallback on the real binary. The kobato server bundle CARRIES the OpenTelemetry SDK and must never carry the browser RUM
SDK.

## Natives

Extraction writes exactly 6 files (8 on win32) into the FLAT `<cache>/natives-<manifest-hash>/`: rpath-patched
`sharp.node` + libvips, `skia.node`, rpath-patched `duckdb.node` + libduckdb, the self-contained `font-split.node`,
win32-only `icudtl.dat` (missing = FATAL). rpath patches run at build time (`install_name_tool` / `patchelf`). sharp /
@napi-rs/canvas / @duckdb/node-api are statically imported and bundled; `redirect-native-requires.ts` rewrites their
platform `require(...)` sites to `nativeRequire` against the flat dir. `font-split.node` is staged from the workspace
build of `@kobato/font-split` (`pnpm --filter @kobato/font-split run build` must precede `sea:build`) — it carries no
companion libraries and no rpath patch, and server code reaches it only through `nativeRequire(FONT_SPLIT_ADDON_SPEC)`.

## Tests

`tests/unit/` runs under the `pack-unit` Vitest project (`tests/unit/vitest.config.ts`); run with `pnpm test tools/pack`
— the config anchors at the REPOSITORY ROOT, so filters resolve from there. The suites pin the SEA compression contract
across the writer/reader seam, the sayaka VFS fs-patch's sequential readv/writev shapes, the `check-bundle` scanner, the
inline-package-data rewrite shapes against the INSTALLED packages, the installed native platform specifiers, and the
build-time plugins (`vite/`: the front-end config factory's plugin order and build shapes, and the dev host's
marker-before-entry guarantee — a real Vite dev server loads a probe entry through `honoDevHost`, the entry sees the
dev-host marker and no `import.meta.hot`, and `@kobato/server`'s `devHostState()` reads the same marker). The tree is
`tests/unit/` only — it has no `tests/it/` — so it also holds these real-resource suites beside the pure-logic ones.
Cross-package asset-key pins live in `apps/kobato/tests/arch/`.

## Commands

- `pnpm run sea:build` → `dist-sea/kobato` + `dist-sea/sayaka` (each with a `.sha256` sidecar), each binary budgeted at
  250 MB (`BINARY_MAX_BYTES`). Deliberately NOT UPX-compressed — do not re-add. The injector requires an official
  **single-architecture** Node distribution and injects with the Node that runs it (`process.execPath`): through pnpm
  that is the repository root's `devEngines.runtime` (the pinned single-arch download), so nothing needs configuring;
  the note about prepending a single-arch `node` to `PATH` (on an Intel Mac with the universal node) applies only when
  the injector is invoked with a bare `node`. **`--build-sea` is the only injector** — no postject; on darwin the
  injector then ad-hoc re-signs the injected binary (`resignDarwinBinary` in `src/sea/inject.ts`:
  `codesign --remove-signature`, then `codesign --sign - --force`).
- `pnpm run sea:smoke [kobato-binary]` — deep managed smoke over the PAIR (budgets, versions, probes, natives + flat
  layout, worker pool, fresh-pair boot, restarts, seeded document through sayaka, the DuckDB round-trip);
  `--external <sayaka-url>` runs only the public HTTP checks; `--binary-only` the service-free ones.
- `pnpm run sea:probe [node-binary]` — systematic VFS capability verification; needs an official Node dist (Homebrew
  lacks the SEA fuse).
- `pnpm run sea:package rename|archive --target <target>` — the CI release-artifact packaging for BOTH binaries.
  `rename` verifies both build checksums and renames to `kobato-<target>[.exe]` + `sayaka-<target>[.exe]` (run before
  smoke); `archive` tars each binary and writes + re-verifies the `.tar.gz.sha256` and bare-binary `.sha256` sidecars
  for both.
- `pnpm run sea:e2e [kobato-binary]` / `sea:browser [kobato-binary]` / `test:browser` — the binary suites over the
  booted pair; `pnpm run split:smoke [--sea]` (`@kobato/instance`'s script) is the ADR-0009 perimeter smoke. What each
  boots and proves, and the binary-argument rules, are in `tools/instance/AGENTS.md`; coverage in
  `apps/kobato/tests/AGENTS.md` and `apps/sayaka/AGENTS.md`.

## Delivery targets

linux-x64 / linux-arm64 / darwin-arm64 / win32-x64 / win32-arm64 via `.github/workflows/sea.yml`: every leg runs the
full managed smoke, e2e, and the browser journeys over the PAIR. Every leg's release artifacts carry both binaries and
both checksum sets. develop pushes and PRs run only `build-verification`; `ci.yml` additionally gates PRs with
`sea:build` + `sea:browser`. On Windows the binaries are `kobato.exe`/`sayaka.exe` (and
`kobato-<target>.exe`/`sayaka-<target>.exe`), the natives cache defaults to `%LOCALAPPDATA%\kobato`, and there is no
SIGTERM (service deployments wrap with WinSW/NSSM). `sea:smoke` / `sea:e2e` / `sea:browser` default to (and document)
the `dist-sea` pair.

## Self-update & rollback

Bare-metal SEA deployments self-update from the admin shell; the pipeline lives in
`packages/server/src/domains/update/`. The restart MUST close the listen socket before spawning the detached
replacement. Gate: `isSea()`, linux x64/arm64, not containerized, writable binary directory, non-`-dev` build. Manual
rollback: `kobato rollback && systemctl restart <service>`; `kobato doctor [--json]` prints aggregated diagnostics.
