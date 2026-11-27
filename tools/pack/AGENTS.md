# @kobato/pack

Build and release tooling for the two-binary SEA distribution (`dist-sea/kobato` and `dist-sea/sayaka`, both from
`pnpm run sea:build`): the SEA pipeline, the build-time Vite plugins, the out-of-process instance driver, and the
binary-suite entry scripts. Nothing here ships inside the product binaries.

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
  `appOptimizeDeps(appDir)` reads the dependency table of the named package whose dev server it serves
  (`packages/web/admin` for the workspace; no default). `src/vite/react-router-hono-server.ts` is sayaka's
  `reactRouterHonoServer` Vite plugin — every request is served through its Hono app. `src/vite/hono-dev-host.ts` is the
  backend's dev host (`honoDevHost({ entry })`: `@hono/vite-dev-server` with the node adapter and no client-script
  injection, used by `apps/kobato/vite.config.ts` to load `src/server.ts`) and owns the three pieces both plugins share:
  the `globalThis` slot keyed by `Symbol.for('kobato.vite-dev-server')` (`VITE_DEV_SERVER_SLOT`, `exposeViteDevServer`),
  the `x-remote-*` request-header middleware, and `forceDevMode`. Each app keeps an app-side `dev-server-ref.ts` that
  reads the slot, because product `src/` never imports a tools package. `src/sea/paths.ts` resolves the workspace's
  client build through the package (`adminPackageDir()` / `adminClientBuildDir()` resolve
  `@kobato/web-admin/package.json` from the kobato app's dependency table) — the SEA asset collection reads the
  workspace build only through the package.
- `src/instance/` — the out-of-process instance driver behind `sea:smoke` / `sea:e2e` / `sea:browser` and `trace:smoke`
  (see "Instance driver"). `src/instance/client/` is the ONLY part test trees import. `src/browser/` — the shared
  Playwright journey support (fixtures factory, page journeys, settings staging, global setup) for BOTH apps'
  `tests/browser` trees; loaded by Playwright only.
- `src/process.ts` — the process primitives every CLI script shares: `fail` (the one print-and-exit failure helper),
  `sleep`, `pickFreePort`, `fetchManual`, `scrubbedParentEnv`, `watchChildExit` / `raceChildExit`. `sea/exec.ts` keeps
  only the command runners (`run`, `tryRun`) on top of it.
- `playwright.config.ts` — the real-browser journey runner config: two projects over ONE booted pair — kobato's
  workspace journeys in `apps/kobato/tests/browser/` and sayaka's public journeys in `apps/sayaka/tests/browser/`, each
  with its own `testDir` and output dir, one shared `globalSetup` (`src/browser/global-setup.ts`), and `baseURL` = the
  sayaka origin. The browser channel is the bundled Chromium unless `KOBATO_BROWSER_CHANNEL` names another (set it to
  `chrome` to launch the installed Google Chrome — no Playwright browser download needed); `browser.ts` spawns
  `pnpm --filter @kobato/pack exec playwright test` and only boots instances, drives the browser, and reports.
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
  through `@kobato/pack/vite/*`; the only relative import left is the build-output entry (`src/sea/server-entry.ts`).

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

## Instance driver (`src/instance/`)

Everything that drives a kobato instance as a REAL separate process — two halves with no dependencies between them:

- **Lifecycle** (CLI entry scripts only) — `temp.ts` (per-run temp roots and smoke databases), `sea-instance.ts` (the
  built SEA binaries as HTTP instances: `bootServer` for kobato, `bootSayakaServer` for sayaka, plus the
  `seaInstanceEnv` / `sayakaInstanceEnv` env tables), `dev-instance.ts` (the repository DEV servers:
  `bootBackendDevServer` boots kobato on a free port with the converged config, `bootAdminDevServer` boots the workspace
  on another with `KOBATO_DEV_BACKEND_URL` pointing at that backend, and `bootSayakaDevServer` boots sayaka with the
  caller's `SAYAKA_KOBATO_RPC_URL` — a dev instance of kobato is the backend plus the workspace, and suites boot either
  or both), `seed.ts` (plain-SQL state for STOPPED instances), `suite-instance.ts` (the PAIR boot: fresh kobato proves
  the /health 303 gate → fresh sayaka proves the / 303 gate through sayaka → stop kobato → seed → restart kobato behind
  the RUNNING sayaka; `stopSuiteInstance` SIGTERMs both and removes the temp root), `analytics.ts` (the DuckDB sidecar
  AFTER shutdown), `split-smoke.ts` (the `split:smoke` entry: boots the BUILT `apps/kobato` + `apps/sayaka` node servers
  as a pair — or, with `--sea`, the `dist-sea/kobato` + `dist-sea/sayaka` binaries plus two `--version` identity checks
  — and verifies the ADR-0009 split perimeter — install gate, CSP nonce/ETag/304 on the home document, modulepreload
  links + the inline route-warmup idle script on that document, the uninstalled setup shell hydrating through headless
  Chrome with its brand logo and favicon answering 200 pre-install, fingerprint-asset caching, the legacy `/tags` and
  `/search` 301 redirects forwarded through sayaka, 404s for unknown category/tag/post/page slugs, ETag-bearing
  `/archives` and `/categories`, a seeded post detail round-trip (admin signin + `upsertMeta` + `publishLatest` on
  kobato, then 200 + Content-Language/ETag and a conditional 304 at sayaka), the forwarded `/admin/signin` document and
  its entry chunk through sayaka, forwarded bootstrap parity, kobato's own origin answering 404 for the former public
  document URLs (the Webmention receive and RUM intake paths included), the binary resource families served by sayaka's
  procedure pairs (branding assets, OG/calendar/avatar images byte-identical to their procedure answers, an embedded
  font and a storage object streaming with Range/304/416 semantics), the two inbound protocols answered through sayaka's
  perimeter handlers byte-identically to the captured router answers (webmention invalid 400 / accepted 202 /
  unknown-target 404 / oversized 413 / disabled 410; RUM intake 404 while the relay is inactive and 415 for compressed
  batches), and resource rate-limit keying on the sayaka-forwarded visitor address). In plain-node mode `split-smoke.ts`
  starts kobato from the temp cwd with `--config <tempRoot>/kobato.config.json` (config and data paths stay absolute in
  the temp root): kobato resolves its client build through the package — `clientAssetsRoot()` in
  `apps/kobato/src/server/client-assets-root.ts` resolves `@kobato/web-admin/package.json` and hands `startKobato` that
  package's `build/client` directory — never through the working directory; under `--sea` both binaries resolve their
  client assets from the VFS and the cwd is the temp root. The seeded-post helpers stay inline in `split-smoke.ts` —
  `client/http.ts`'s parameter properties are not plain-node type-strippable. The sayaka DEV boot runs the app's own
  `dev` script (`pnpm --filter <app> run dev --host …`) so the app-script's repoRoot cwd and app-dir positional stay
  authoritative.
- **`client/`** (what the live-instance suites speak) — `http.ts` (`E2eClient`, the `KOBATO_E2E_*` env contract —
  `KOBATO_E2E_BASE_URL` is kobato's origin for backend-direct checks, `KOBATO_E2E_PUBLIC_URL` is sayaka's origin for
  everything a browser reaches; the oRPC signin helpers: `bootstrapCsrfToken` → `loginAdmin` answers the
  `AuthFlowOutput` shape, `readAuthFlow` decodes it), `rpc.ts` (`callE2eRpc`; `path` is the camelCase structural router
  path — kebab-case `.route()` strings are OpenAPI metadata, not the RPC wire path), `browser-env.ts` (the
  `KOBATO_BROWSER_*` env contract; `KOBATO_BROWSER_BASE_URL` is the sayaka origin — the one listener a browser needs).

`src/sea/{smoke,e2e,browser}.ts` and `@kobato/trace` compose both halves; `apps/kobato` `tests/e2e` and `tests/browser`
and `apps/sayaka`'s two suites import `@kobato/pack/instance/client/*` and `@kobato/pack/browser/*`. The trace smoke
boots all three dev servers through `dev-instance.ts` and drives the admin through the workspace origin.

- `src/process.ts` and the driver import only `@kobato/settings`, `@kobato/utils`, and their own modules — they drive
  built artifacts and running processes, never a source graph, and never reach `src/sea`, `src/vite`, or `src/browser`
  (pinned by `apps/kobato/tests/arch/package-dag.test.ts`).
- The config file always lives inside the per-run temp root; config vars never come from the parent env (env > file
  would silently override the converged file); seeding only touches a STOPPED database; every boot pairs with a stop
  (`stopDevServer`, `stopSuiteInstance`) that SIGTERMs the child and removes the temp root — entry scripts call it from
  `finally`. A sayaka boot survives kobato restarts (per-request upstream clients), so suite boots restart kobato behind
  a running sayaka.
- Entry scripts run under plain `node` type-stripping, so every module they reach — `src/process.ts`, the lifecycle
  half, and `client/browser-env.ts` — stays free of non-strip TS syntax (no parameter properties, enums, or namespaces);
  `client/http.ts` and `client/rpc.ts` load under Vitest, Playwright, or `vite-node` only. Keep every module importable
  with zero side effects.
- `src/browser/` runs under Playwright only: `journey.ts` (signin through the oRPC auth flow, page journeys,
  console/hydration probes), `settings-api.ts` (admin HTTP staging over `client/`), `fixtures.ts` (the `test`/`expect`
  factory both apps' specs import), `global-setup.ts` (the one Playwright global setup both projects share — stages one
  post and resets the general-settings baseline through the sayaka-forwarded admin).

## Tests

`tests/unit/` runs under the `pack-unit` Vitest project (`tests/unit/vitest.config.ts`); run with `pnpm test tools/pack`
— the config anchors at the REPOSITORY ROOT, so filters resolve from there. The suites pin the SEA compression contract
across the writer/reader seam, the sayaka VFS fs-patch's sequential readv/writev shapes, the `check-bundle` scanner, the
inline-package-data rewrite shapes against the INSTALLED packages, the installed native platform specifiers, and the
build-time plugins (`vite/`). Cross-package asset-key pins live in `apps/kobato/tests/arch/`.

## Commands

- `pnpm run sea:build` → `dist-sea/kobato` + `dist-sea/sayaka` (each with a `.sha256` sidecar), each binary budgeted at
  250 MB (`BINARY_MAX_BYTES`). Deliberately NOT UPX-compressed — do not re-add. The injector requires an official
  **single-architecture** Node distribution; on an Intel Mac with the universal node, prepend a single-arch `node` to
  `PATH`. **`--build-sea` is the only injector** — no postject, no codesign on darwin.
- `pnpm run split:smoke [--sea]` — the ADR-0009 split perimeter smoke (54 checks) over the built node servers; `--sea`
  boots `dist-sea/kobato` + `dist-sea/sayaka` instead and adds the two `--version` identity checks.
- `pnpm run sea:smoke [kobato-binary]` — deep managed smoke over the PAIR: budgets, versions, probes, natives + flat
  layout, worker pool, fresh-pair boot (kobato install gate + sayaka gate through sayaka + the setup shell and one
  embedded asset), SIGTERM ×2, cache reuse, config convergence + reduced-env restart, seeded home document + one
  fingerprint asset + calendar through sayaka, page views + DuckDB round-trip, SIGTERM ×2 again.
  `--external <sayaka-url>` runs only the public HTTP checks; `--binary-only` the service-free ones. A binary argument
  names the KOBATO binary; the sayaka binary is its `sayaka` sibling (same directory, same suffix), or the default
  `dist-sea/sayaka` when no argument is given.
- `pnpm run sea:probe [node-binary]` — systematic VFS capability verification; needs an official Node dist (Homebrew
  lacks the SEA fuse).
- `pnpm run sea:package rename|archive --target <target>` — the CI release-artifact packaging for BOTH binaries.
  `rename` verifies both build checksums and renames to `kobato-<target>[.exe]` + `sayaka-<target>[.exe]` (run before
  smoke); `archive` tars each binary and writes + re-verifies the `.tar.gz.sha256` and bare-binary `.sha256` sidecars
  for both.
- `pnpm run sea:e2e [kobato-binary]` / `sea:browser [kobato-binary]` — the two binary suites over the booted pair
  (coverage in `apps/kobato/tests/AGENTS.md` and `apps/sayaka/AGENTS.md`). `pnpm run test:browser` runs the same
  journeys against `KOBATO_BROWSER_BASE_URL` when it is set, and otherwise boots the pair exactly like `sea:browser`.

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
