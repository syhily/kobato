# ADR-0002: node:vfs status and adoption

- Status: accepted (adopted for SEA assets; Node 26 `useVfs`)
- Date: 2026-07-27

## Context

The production server ships as a single Node.js SEA executable that embeds every runtime
resource — client assets, drizzle migrations, the cnfs wasm, worker code, libvips metadata —
in the binary blob, because a SEA cannot load modules or files from a filesystem it does not
have. A patch layer (asset readers, a compression registry, single-file bundling, `eval:true`
worker dispatch, a native-require redirect) was built on top of that constraint.

`node:vfs` is Node's own virtual filesystem subsystem. Node 26.9 shipped SEA `"useVfs": true`:
the blob mounts as a read-only VFS, the injected ESM `main` (`mainFormat: "module"`) runs from
the mount root, and every asset key maps 1:1 to a path under it. That met the adoption
criteria (unflagged SEA mount, filesystem module loading from the mount, an LTS line — the
toolchain pins Node 26.13.0 in `.nvmrc` and CI matrices, `package.json` engines `>=26.9.0`).
The mount needs no flag; `--experimental-vfs` gates only the userland `node:vfs` module,
which the binary never imports and which throws `ERR_UNKNOWN_BUILTIN_MODULE` inside a SEA.

## Decision

**Adopted: the SEA build uses `useVfs`, and the asset layer was migrated onto the mount.**

- **The mount is the filesystem.** `seaVfsRoot()` (`src/server/infra/sea.ts`) is the bundle's
  `import.meta.dirname`; `seaAssetPath(key)` joins a key onto it. Raw assets (`client/`,
  `drizzle/`, `wasm/`, `worker/`, `natives-meta/`) are plain `node:fs` reads through that
  helper (`readAssetTextOrDisk` in `src/server/infra/sea-asset.ts` for text resources), with
  the non-SEA disk path as fallback. Hono's `serveStatic` and drizzle's folder migrator run
  against the mount unchanged.
- **Only `natives/*` is compressed.** The blob stores assets uncompressed (~1 MB asset → +1 MB
  binary), so `shouldPackAsset` (`scripts/sea/assets.ts`) packs `natives/*` only — zstd level 9
  multithreaded, the only codec — and packed bytes are unreadable through the VFS by design.
  `manifest.json` rides raw as the codec/integrity registry; `getEmbeddedAsset` decodes lazily
  per key over the `node:sea` getAsset channel and also works inside worker threads.
- **Workers stay on `eval:true`.** A worker can neither start from a VFS path (`new Worker(<mount
  path>)` → `Cannot find module` under every `execArgv`) nor see the mount (fs calls under it →
  `ENOTDIR`). The main thread `readFileSync`s the worker bundle from the mount and dispatches it
  with `execArgv: ['--input-type=module']`, forwarding `argv` (workers do not inherit it; the
  module flag keeps `import.meta.url` a `file:` URL).
- **Native libraries are extracted to real files.** `dlopen` needs disk, so the rpath-patched
  `sharp.node` + libvips, `skia.node`, and rpath-patched `duckdb.node` + libduckdb (plus win32
  `icudtl.dat`) are extracted into the flat `<cache>/natives-<manifest-hash>/` and resolved via
  `KOBATO_NATIVES_DIR`. A self-contained `.node` (skia) can `require()` from the mount's private
  temp image, but an addon with companion libraries (sharp+libvips, duckdb+libduckdb) fails
  `ERR_DLOPEN_FAILED` there — the "addons load from VFS" doc line does not extend to dependent
  libraries. `scripts/sea/redirect-native-requires.ts` (Vite plugin) rewrites the platform
  packages' `require(...)` sites to `nativeRequire` (`src/server/infra/native-require.ts`) against
  that dir and the embedded `natives-meta/*`; it stays.
- **Bundling stays single-file.** `vite.sea.config.ts` builds `server.mjs`,
  `process-worker.mjs`, and `smoke-worker.mjs` with `ssr.noExternal: true` and
  `codeSplitting: false`; check-bundle still fails on leftover externals and uncovered
  `__APP_*__`/`__SEA_*__` identifiers.
- **Runtime repair for async `readv`/`writev`** (`src/server/infra/sea-vfs-fs-patch.ts`). The
  mounted-VFS handler table implements `readvSync`/`writevSync` but not async `readv`/`writev`,
  while callback `fs.readv`/`fs.writev` call `h.readv`/`h.writev` unguarded whenever any VFS layer
  is mounted — so any buffered `fs.createWriteStream` flush (`WriteStream._writev` fires once two
  chunks queue) crashes the process with `TypeError: h.writev is not a function`, on real files
  outside the mount too. The patch replaces both public `fs` exports with sequential
  single-operation fallbacks (streams resolve them per call, so later streams are covered); the
  promises API bypasses the handler table and needs no repair. It is main-thread-of-a-SEA only,
  idempotent, and installed from `sea-bootstrap` before the server graph and from `sea-cli`
  before its flag dispatch.
- **Node pin and gates.** `.nvmrc` / CI matrices pin 26.13.0; the SEA build additionally gates
  on >= 26.10.0 (`REQUIRED_NODE_VERSION` in `scripts/sea/build.ts`) for the dlopen fix below.
  The retired `process.dlopen` guard must not come back: Node 26.10 fixed the VFS addon loader
  forwarding a missing flags argument as an explicit `undefined` (coerced to dlopen mode 0, which
  glibc rejects → every main-thread native load of a linux SEA died; darwin's dyld tolerates
  mode 0, so linux CI `sea:smoke` is the only detector).
  `node:vfs` userland additions since (`--vfs-mount`/`--vfs-load`, ComposableProvider,
  `--allow-fs-vfs`, ZipProvider readdir/parent-dir fixes, `node:ffi` loading from a mount) are
  irrelevant here: no ffi use, and the startup flags are userland tooling.

**Rejected alternatives:**

- **pkg's `@roberts_lando/vfs`** — third-party monkey-patching of Node's fs layer: patches
  internals the project does not control, native extraction fails for sharp-in-workers, and its
  Worker patch misses `URL` spawns.
- **Adopting the flagged subsystem early** (`--experimental-vfs` in production) — Stability 1
  changes without notice and contradicts the stock-Node posture in `scripts/sea/AGENTS.md`; it
  would also have bought nothing before the SEA mount shipped.
- **`vfsArchive`** (SEA `assets` replaced by one zip, nodejs/node#65810) — the SEA config cannot
  combine it with `assets` (all-or-nothing), and the payload is 92% natives (163 MB of 177.7 MB
  raw), where zstd-9 beats zip deflate: one deflated zip lands within a few MB of today's
  62.5 MB packed payload. It would add per-read inflate on every client-asset serve, kill the
  worker `getEmbeddedAsset` channel for `natives-meta/*` (forcing build-time inlining), and force
  a rework of the whole packing pipeline. Re-open only if the asset mix shifts (~10× client
  growth) or workers gain mount visibility.
- **Unbundling jsdom & co. into a `node_modules` mount tree**, **multi-chunk builds importing
  from the mount**, and **skia-without-extraction on darwin/linux** — mount-confined lookups do
  work, but each forks the bundling posture or platform behavior for a small saving.

## Consequences

- Do NOT reintroduce `listEmbeddedAssetKeys`, `serveEmbeddedStatic`, or an embedded migration
  reader: raw assets are mount paths, and the libraries' own filesystem readers run against the
  mount.
- Never `seaAssetPath` a `natives/*` key — it throws, because the VFS file holds zstd bytes.
- The seam for future changes is `seaAssetPath` / `getEmbeddedAsset` / `nativeRequire`, not
  call-site conventions.
- On each Node upgrade run `pnpm run sea:probe` (`scripts/sea/vfs-capabilities.ts`; 20 checks /
  63 assertions green on 26.13.0) and re-check the matrix: workers cannot use VFS paths,
  dependent-library addons fail from the mount, async `readv`/`writev` crash, `node:vfs` is
  absent inside a SEA. Zero compatibility patches are removable while those hold; if the probe
  reports the writev signature `fixed`, revisit the fallbacks rather than deleting them blind.
- Local probe runs need a single-arch Node: the official macOS installer is universal, carries
  two SEA sentinel fuses, and `--build-sea` rejects it (`lipo -thin <arch>` first).
- The empirical matrix is restated operationally in `scripts/sea/AGENTS.md` and
  `src/server/infra/AGENTS.md`; the runtime behavior is pinned by
  `tests/unit/server/infra/node-vfs.test.ts` and `tests/unit/server/infra/sea-vfs-fs-patch.test.ts`.
- A flipped constraint is recorded by amending this ADR, then scheduling the deletion work.
