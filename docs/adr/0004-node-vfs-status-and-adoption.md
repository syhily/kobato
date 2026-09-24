# ADR-0004: node:vfs status and adoption

- Status: accepted (**adopted for SEA assets as of 2026-09-21** — see the amendment)
- Date: 2026-07-27

## Context

The SEA single executable ships every runtime resource — client assets,
drizzle migrations, the cnfs wasm, worker code, libvips metadata —
embedded in the binary's blob, because **Node's SEA cannot load modules
or files from the filesystem it does not have**. Over Phases 1–3 we built
a patch layer on top of that constraint:

- the `getEmbeddedAsset` / `listEmbeddedAssetKeys` readers and the
  `requireEmbeddedAssetText` helper (`src/server/infra/sea.ts`,
  `sea-asset.ts`), plus the manifest's compression registry (zstd/brotli
  codec per asset, lazy decode);
- the single-file bundling constraint — the whole server graph inlined
  into one ESM `server.mjs` (`vite.sea.config.ts`,
  `ssr.noExternal: true`, `codeSplitting: false`), because a SEA entry
  cannot `import()` from disk;
- the `eval:true` worker dispatch for `worker/process-worker.mjs` and
  `worker/smoke-worker.mjs` (embedded text instead of a worker file);
- the `native-require` redirect: a bundler plugin
  (`scripts/sea/redirect-native-requires.ts`) rewriting sharp's and
  @napi-rs/canvas's platform `require(...)` call sites to
  `nativeRequire(...)` (`src/server/infra/native-require.ts`), which
  answers them from the flat natives dir and embedded metadata assets.

`node:vfs` is Node's own virtual filesystem subsystem, the candidate that
would make most of this layer unnecessary. Its status as of this writing
(researched 2026-07-26 against nodejs/node PRs and the v26 release line):

- A **minimal fs-dispatch subsystem** landed in **v26.4.0** behind
  `--experimental-vfs` (Stability 1 — the explicit "do not use in
  production" tier; PRs #63115 / #63537).
- The **full VFS PR** ([nodejs/node#61478](https://github.com/nodejs/node/pull/61478))
  is still open with no landing schedule.
- It does **not** change the SEA "no filesystem module loading" rule
  today. The v25.7 ESM-entry PR ([nodejs/node#61813](https://github.com/nodejs/node/pull/61813),
  the one that delivered `mainFormat: "module"`) explicitly notes that a
  VFS "would unlock that" — i.e., mounting the blob as a virtual
  filesystem and importing from it — as **future work**, not shipped
  capability.

## Decision

**`node:vfs` is designated as the future replacement for our patch
layer — not now, and only behind explicit adoption triggers.** We do not
adopt anything today: the current subsystem is flagged, Stability 1, and
functionally insufficient. The adoption triggers are ALL of:

1. VFS ships **unflagged** (Stability 2 / stable) — no
   `--experimental-vfs` required;
2. **SEA filesystem module loading is officially supported** — the
   `mainFormat`/SEA docs state that embedded entries may `import()` from
   the mounted VFS (the capability #61813 deferred);
3. the feature rides an **LTS line** (our binaries ship on LTS, not
   Current).

**What adoption would delete:** the `getEmbeddedAsset`/`sea-asset` asset
plumbing and the manifest compression registry (reads become plain `fs`
against the mounted blob — compression may survive as a packaging detail
if VFS stays uncompressed, but the decode registry as such dies); the
single-file bundling constraint (multi-chunk builds with real
`import()`s); the `eval:true` worker dispatch (workers spawn from VFS
paths); the `native-require` redirect plugin (the platform packages'
`require` calls resolve against the VFS-exposed package tree).

**What adoption would KEEP regardless:** the extraction of the real
native dynamic libraries (the rpath-patched sharp addon, libvips, the
skia addon) to a cache dir. `dlopen` needs real files on disk — a
virtual filesystem cannot serve them. That is not a patch layer; it is
physics.

## Rejected alternatives

- **pkg's `@roberts_lando/vfs`** (third-party monkey-patching of Node's
  fs layer, used by pkg's `--sea` mode) — rejected with pkg itself
  (`tmp/pkg-prototype/`): it patches internals we do not control, its
  native extraction fails for sharp-in-workers, and its Worker patch
  misses `URL` spawns. Third-party monkey-patching is exactly the kind
  of upstream-coupling this project avoids.
- **Adopting the flagged subsystem early** (`--experimental-vfs` in
  production) — Stability 1 APIs change without notice, and shipping
  production binaries on an experimental flag contradicts the stock-Node
  posture (see the AGENTS.md SEA section). The minimal landed subsystem
  also does not yet provide filesystem module loading, so it would buy
  nothing today.

## Consequences

- Watch item: on each Node LTS upgrade, re-check the three adoption
  triggers against the current `node:vfs` docs and the #61478 status.
- Until then, the patch layer documented in AGENTS.md (asset plumbing,
  compression registry, single-file bundles, eval workers, native-require
  redirect) is the supported design; changes to it should preserve the
  invariant that a later VFS adoption can delete it without touching
  product code (the seam is `getEmbeddedAsset` / `nativeRequire`, not
  call-site conventions).
- This ADR records status as of 2026-07-27; when any trigger flips, amend
  it rather than adding a new ADR, then schedule the deletion work.

## Amendment 2026-09-21: adopted for SEA assets (Node 26.9.0 `useVfs`)

Trigger 2 flipped: **v26.9.0 shipped SEA `"useVfs": true`**
([VFS](https://nodejs.org/api/vfs.html) /
[SEA](https://nodejs.org/api/single-executable-applications.html) docs,
`vfs.mount()` module-loader integration in the same release). The SEA
mount needs **no flag** — the `--experimental-vfs` flag gates only the
userland `node:vfs` module, which the binary never imports (it throws
`ERR_UNKNOWN_BUILTIN_MODULE` inside a SEA — pinned by the probe).
Trigger 3 is imminent by construction: the toolchain already pins Node
26.9.0 (`.nvmrc`, CI matrices), and 26 enters LTS in 2026-10.

Everything below was **verified empirically** on the pinned 26.9.0, not
read from docs; the probe lives in `scripts/sea/vfs-capabilities.ts`
(`pnpm run sea:probe`, 20 checks / 63 assertions) and
`tests/unit/server/infra/node-vfs.test.ts`.

**Adopted (the migration deleted real code):**

- Raw assets (`client/`, `drizzle/`, `wasm/`, `worker/`, `natives-meta/`)
  are plain files in the mount — every asset key maps 1:1 to a VFS path
  under `seaVfsRoot()` (= the bundle's `import.meta.dirname`). Reads go
  through `node:fs` via `seaAssetPath`; `serveEmbeddedStatic`, the
  embedded migration reader, and `listEmbeddedAssetKeys` are **deleted**
  (hono's `serveStatic` and drizzle's own folder migrator run against
  the mount unchanged).
- Only `natives/*` stays zstd-packed (`shouldPackAsset`) — the blob
  stores assets uncompressed (verified: 1 MB asset → +1 MB binary), so
  packing the ~170 MB natives remains a budget requirement, and packed
  bytes would be unreadable through the VFS anyway.

**Empirically corrected assumptions (the 2026-07 predictions that did
NOT hold):**

- **Workers still cannot start from VFS paths** — `new Worker(<mount
path>)` fails with `Cannot find module` under every `execArgv`
  combination, and worker isolates cannot even _see_ the mount (fs under
  it → `ENOTDIR`). The `eval:true` dispatch stays; the worker code is
  now simply `readFileSync`'d from the VFS by the main thread.
- **The native-require redirect stays.** A _self-contained_ `.node`
  (skia) does `require()` from the VFS (private temp image), but an
  addon with companion libraries (sharp+libvips, duckdb+libduckdb)
  fails with `ERR_DLOPEN_FAILED` — the temp image's location satisfies
  no rpath. Extraction is physics, as predicted; the "addons load from
  VFS" line in the vfs docs does not extend to dependent libraries.
- **The manifest compression registry survives** in narrowed form: it
  remains the codec dispatch for the packed natives and the integrity
  source for extraction, read via the `node:sea` getAsset channel (the
  one that also works inside workers).

**The writev landmine (runtime patch, verified 2026-09-21):** the
mounted-VFS handler table (`lib/internal/vfs/setup.js`) implements
`readvSync`/`writevSync` but NOT the async `readv`/`writev`, while the
callback `fs.readv`/`fs.writev` (`lib/fs.js`) invoke `h.readv`/`h.writev`
unguarded whenever any VFS layer is mounted. Any buffered
`fs.createWriteStream` flush (`WriteStream._writev` fires the moment two
chunks queue) therefore kills the process with
`TypeError: h.writev is not a function` — on REAL files outside the
mount, too; it surfaced as a full server crash mid backup/restore in
`sea:e2e`, reproduced with a 30-line mini SEA, and confirmed unfixed on
nodejs/node main. The repair
(`src/server/infra/sea-vfs-fs-patch.ts`, installed from `sea-bootstrap`
ahead of the server graph — and also from `sea-cli` before its flag
dispatch, whose top-level await suspends module evaluation ahead of the
sea-bootstrap sibling) replaces both entry points on the public `fs`
exports with sequential single-operation fallbacks — WriteStream resolves
`fs.writev` per call through that same object, so every later stream is
covered. The promises API bypasses the handler table and needs no repair.
The probe pins the crash signature (`pnpm run sea:probe`); if a future
Node flips it to `fixed`, revisit the patch rather than deleting it
blind (the fallbacks are correct everywhere, just slower than
`writeBuffers`).

**The dlopen flags landmine (runtime patch, verified 2026-09-21):** the
VFS addon loader (`installAddonLoader` in `lib/internal/vfs/setup.js`)
wraps `process.dlopen` as `function (module, filename, flags)` and
unconditionally forwards all three arguments to the captured original.
The CJS `.node` extension handler calls `process.dlopen(module, path)`
with no flags, so the original receives an EXPLICIT `undefined` — and
the C++ `DLOpenImpl` (`src/node_binding.cc`) only applies its
`DLib::kDefaultFlags` (RTLD_LAZY) when the argument is absent; an
explicit `undefined` coerces through `Int32Value` to 0. glibc's dlopen
rejects mode 0 with `invalid mode for dlopen(): Invalid argument`
(ERR_DLOPEN_FAILED), so EVERY main-thread native addon load of a linux
SEA died — sharp, skia, and duckdb alike, from real extracted files.
It surfaced as the `sea:smoke` linux-x64 failures of `--smoke-natives`
(sharp's load-error reporter then crashed on a codeless
`native-require` error, masking the root cause) and of server boot
(duckdb.node). darwin's dyld tolerates mode 0 and worker threads never
register a VFS layer (their `process.dlopen` stays the raw binding), so
neither local smoke runs nor the worker smoke could see it — only
linux CI. The repair lives beside the writev one in
`src/server/infra/sea-vfs-fs-patch.ts` (same two install sites): a
`process.dlopen` re-wrap that substitutes Node's own default
(`DEFAULT_DLOPEN_FLAGS`, mirroring `kDefaultFlags`) whenever flags is
missing, so the VFS wrapper forwards a valid mode; the VFS-resident
`dlopenBinary` branch is unaffected since RTLD_LAZY IS its default for
undefined.

**Still rejected / future work:** unbundling jsdom & co. into a
`node_modules` asset tree (mount-confined lookups work — verified — but
the bundling constraint and check-bundle posture make it a separate
evaluation); multi-chunk builds importing from the mount; skia-without-
extraction on darwin/linux (forks platform behavior for a 31 MB
one-time extraction saving).

## Amendment 2026-09-24: Node 26.10.0 — dlopen guard retired

The toolchain pin moved to 26.10.0 (14 vfs commits; the full matrix was
re-verified with `pnpm run sea:probe`, 20/20 green). What changed for
this ADR:

- **The dlopen flags landmine is FIXED upstream**
  ([nodejs/node#65909](https://github.com/nodejs/node/pull/65909), the
  same PR stops forwarding a missing flags argument as an explicit
  `undefined`). The `process.dlopen` re-wrap is deleted from
  `src/server/infra/sea-vfs-fs-patch.ts`, and `scripts/sea/build.ts`
  now gates the SEA build on Node >= 26.10 so a 26.9 build machine can
  never ship a linux binary without the fix. darwin cannot observe the
  bug (dyld tolerates mode 0), so the detector remains the linux CI
  `sea:smoke` — first green linux run on 26.10 is the proof.
- **The writev landmine is NOT fixed** (nothing in the 26.10.0 vfs
  commits touches async `readv`/`writev`; the probe still pins the
  crash signature). The sequential fallbacks stay.
- **Workers still cannot start from / see VFS paths**, `node:vfs` is
  still absent inside a SEA, and dependent-library addons still fail
  from the mount — all re-pinned by the probe on 26.10.0. The
  eval-worker dispatch and natives extraction are untouched.

New capabilities noted, none adopted:

- `--vfs-mount` / `--vfs-load` startup flags
  ([nodejs/node#65748](https://github.com/nodejs/node/pull/65748),
  behind `--experimental-vfs`) — userland tooling, irrelevant to the
  SEA blob mount; `--vfs-mount` was already removed again on main
  ([nodejs/node#66162](https://github.com/nodejs/node/pull/66162)).
- `node:ffi` loads libraries from a mounted VFS (#65909) — no ffi use
  in this project.
- **Worth watching:** a `vfsArchive` SEA config option
  ([nodejs/node#65810](https://github.com/nodejs/node/pull/65810))
  missed the 26.10.0 cut but is merged on main — it embeds ONE zip as a
  reserved asset and mounts a ZipProvider over a zero-copy view
  (~32% binary-size win at 128 MB of compressible assets, flat ~10 ms
  startup penalty, ~2.5x slower reads than the memcpy path), and fixes
  a per-lookup copy of the whole assets map in
  `FindSingleExecutableResource`. When it ships, re-evaluate the zstd
  `natives/*` packing tradeoff against it.
