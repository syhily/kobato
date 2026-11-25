# Fonts

Self-hosted web-font slicing. `slice.ts` drives the `@kobato/font-split` Node-API native addon — a vendored fork of
[KonghaYao/cn-font-split](https://github.com/KonghaYao/cn-font-split) living at `tools/font-split/` with its own
AGENTS.md (layout, toolchain pins, corpus, commands). The binding runs on the libuv pool, so the event loop is never
blocked. `vendor/napi-split.ts` is the binding seam: `fontSplit(props)` + `fontSplitAlgorithmVersion()`, loading the
addon through `nativeRequire(FONT_SPLIT_ADDON_SPEC)`. Product src never statically imports `@kobato/font-split`
(`package-dag.test.ts`): dev resolves the workspace package's `./font-split.node` export, SEA the extracted
`natives/font-split.node` (asset key owned by `@kobato/distribution/sea-assets`).

## Sliced-package storage

- Packages live at `fonts/<sha256>/<algorithmVersion>/` (`storage.ts`); the fingerprint comes from the addon
  (`algorithm_fingerprint()` — tables, frequencies, DP λ/μ, WOFF2 quality), so an algorithm change derives new keys and
  never mixes with stale slices. The row's `cssKey` embeds the version — no schema column.
- Re-uploading the same bytes under a new algorithm version re-slices, repoints the row, and removes the stale package
  best-effort. Font source bytes are not stored. Concurrent uploads of identical bytes coalesce process-locally on the
  sha256 (`inFlightUploads` in `services/upload.ts`).
- The addon is compiled, not vendored as a binary: `pnpm --filter @kobato/font-split run build` must run once per
  machine before `pnpm dev` or any test touching `sliceFont`, and in CI before `sea:build` — `vendor/napi-split.ts`
  throws an actionable error when it is missing. Updating: re-vendor the upstream `release` branch into
  `tools/font-split/` following its AGENTS.md; `cargo test` plus the real-TTF `sliceFont` unit test are the drift
  guards.
