# Fonts

Self-hosted web-font slicing. `slice.ts` drives the `@kobato/font-split` Node-API native addon — a vendored fork of
[KonghaYao/cn-font-split](https://github.com/KonghaYao/cn-font-split) living at `tools/font-split/` with its own
AGENTS.md (layout, toolchain pins, corpus, commands). The binding runs on the libuv pool, so the event loop is never
blocked. `vendor/napi-split.ts` is the binding seam: `fontSplit(props)` + `fontSplitAlgorithmVersion()`, loading the
addon through `nativeRequire(FONT_SPLIT_ADDON_SPEC)`. Product src never statically imports `@kobato/font-split`
(`package-dag.test.ts`): dev resolves the workspace package's `./font-split.node` export, SEA the extracted
`natives/font-split.node` (asset key owned by `@kobato/base/distribution/sea-assets`).

A rejection by the addon is rethrown by the seam as `FontSplitRejectedError`; `sliceFont` turns it into
`DomainError('BAD_REQUEST', 'fonts.error.unreadable')` and logs the native reason. A font that passes the magic and
table-bounds pre-validation but cannot be read is the uploader's problem, while an unavailable addon or a missing
`result.css` stays an internal error. The addon resolves to `{ files, warnings }`: a warning names a table the slicer
proceeded without (an unreadable GSUB or GPOS — the package then carries no relation from that table), and the seam logs
every one at warn level under `fonts.napi-split` instead of dropping it. `sliceFont` also asks for a reproducible
stylesheet (`commentBase: false` drops the generation timestamp), so re-slicing the same font yields byte-identical CSS
and a stable ETag.

## Sliced-package storage

- Packages live at `fonts/<sha256>/<algorithmVersion>/` (`storage.ts`); the fingerprint comes from the addon
  (`algorithm_fingerprint()` — schema version, tables, frequencies, DP λ/μ, WOFF2 quality, probe quality and sample
  size), so an algorithm change derives new keys and never mixes with stale slices. The row's `cssKey` embeds the
  version — no schema column.
- Re-uploading the same bytes under a new algorithm version re-slices, repoints the row, and removes the stale package
  best-effort. The family name is part of the package (it is the CSS `font-family` and its `local()` source): the same
  bytes under another family name re-slice into the same prefix and rename the row in place, so the id and its slot
  references stay valid; under the same version and family name the upload is a no-op. Font source bytes are not stored.
  Concurrent uploads of identical bytes coalesce process-locally on the sha256 (`inFlightUploads` in
  `services/upload.ts`).
- The addon is compiled, not vendored as a binary: `pnpm --filter @kobato/font-split run build` must run once per
  machine before `pnpm dev` or any test touching `sliceFont`, and in CI before `sea:build` — `vendor/napi-split.ts`
  throws an actionable error when it is missing. Updating: take upstream fixes into `tools/font-split/` by hand
  following its AGENTS.md — the partition pipeline there is Kobato-owned, a re-vendor would drop it; `cargo test` plus
  the real-TTF `sliceFont` unit test are the drift guards.
