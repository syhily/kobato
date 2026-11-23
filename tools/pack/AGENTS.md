# @kobato/pack

Packaging tooling for the single-executable distribution. Nothing here ships inside the product binary.

- `src/sea/` — the SEA pipeline (asset discovery/embedding, injection, smoke/probe/e2e, self-update).
- `src/vite/` — the shared `vite.config.ts` building blocks (app define tables, dev-server `optimizeDeps`, sanitize
  engine alias); `check-bundle.ts` derives its defined-globals table from `seaAppDefines`.
- `src/release.ts` — version sync and release preparation (`release:bump` / `release:prepare-next` / `release:tag` /
  `version:sync`).
- Build-time configs import the plugins through `@kobato/pack/sea/*` and `@kobato/pack/vite/*`; the one relative import
  left is the build-output entry (`src/sea/server-entry.ts`).

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

Vite 8 builds three bundles (`SEA_BUNDLE` loop in `src/sea/build.ts`): `server.mjs` (injected main) +
`process-worker.mjs` + `smoke-worker.mjs` (embedded text assets) — minified, single-file, `ssr.noExternal: true`.
`check-bundle.ts` fails the build on leftover external specifiers or uncovered `__APP_*__`/`__SEA_*__` identifiers. The
server bundle CARRIES the OpenTelemetry SDK and must never carry the browser RUM SDK.

## Natives

Extraction writes exactly 6 files (8 on win32) into the FLAT `<cache>/natives-<manifest-hash>/`: rpath-patched
`sharp.node` + libvips, `skia.node`, rpath-patched `duckdb.node` + libduckdb, the self-contained `font-split.node`,
win32-only `icudtl.dat` (missing = FATAL). rpath patches run at build time (`install_name_tool` / `patchelf`). sharp /
@napi-rs/canvas / @duckdb/node-api are statically imported and bundled; `redirect-native-requires.ts` rewrites their
platform `require(...)` sites to `nativeRequire` against the flat dir. `font-split.node` is staged from the workspace
build of `@kobato/font-split` (`pnpm --filter @kobato/font-split run build` must precede `sea:build`) — it carries no
companion libraries and no rpath patch, and server code reaches it only through `nativeRequire(FONT_SPLIT_ADDON_SPEC)`.

## Instance harness

The out-of-process lifecycle behind `sea:smoke` / `sea:e2e` / `sea:browser` lives in `@kobato/harness` — this package
keeps the build/inject/budget/bundle-check pipeline and entry scripts only; extend the harness instead (never the
reverse).

## Tests

`tests/unit/` runs under the `pack-unit` Vitest project (`tests/unit/vitest.config.ts`, node environment, spread from
`@kobato/test/vitest.base.ts`); run with `pnpm test tools/pack` — the config anchors at the REPOSITORY ROOT, so filters
resolve from there. The suites pin the SEA compression contract across the writer/reader seam
(`sea/sea-compression.test.ts`), the `check-bundle` scanner, the inline-package-data rewrite shapes against the
INSTALLED packages, and the installed native platform specifiers. Cross-package asset-key pins live in
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
  `apps/kobato/tests/AGENTS.md`).

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
