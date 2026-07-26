# ADR-0004: node:vfs status and future adoption

- Status: accepted (watch item)
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
- the `eval:true` worker dispatch for `worker/process-worker.cjs` and
  `worker/smoke-worker.cjs` (embedded text instead of a worker file);
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
