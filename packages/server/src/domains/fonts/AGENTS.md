# Fonts

Self-hosted web-font slicing. `slice.ts` drives the `@kobato/font-split` Node-API native addon — a vendored fork of
[KonghaYao/cn-font-split](https://github.com/KonghaYao/cn-font-split) (`release` branch @ `1650af13`, released as 7.6.8)
living at `tools/font-split/` with its own AGENTS.md. The Rust core (protobuf-free) takes a TTF/WOFF2 byte buffer and
returns `result.css` + `*.woff2` chunks in memory; the binding runs on the libuv pool (`napi` async `Task`), so the
event loop is never blocked.

`vendor/` holds only the binding seam now:

| File                   | Source    | Role                                                                                |
| ---------------------- | --------- | ----------------------------------------------------------------------------------- |
| `vendor/napi-split.ts` | This repo | `fontSplit(props)` — loads the addon through `nativeRequire(FONT_SPLIT_ADDON_SPEC)` |

Product src never statically imports `@kobato/font-split` (the tools boundary in `package-dag.test.ts`); the addon is
reached exclusively through `nativeRequire` — dev resolves the workspace package's `./font-split.node` export, SEA
resolves the extracted `natives/font-split.node` (asset key owned by `@kobato/distribution/sea-assets`). The root
`package.json` declares the workspace link per the "production native-dynamic-library" convention.

## Build prerequisite

The addon is compiled, not vendored as a binary: `pnpm --filter @kobato/font-split run build` (stable Rust via
`rust-toolchain.toml`, cmake, C++ toolchain) must run once per machine before `pnpm dev` or any test touching
`sliceFont`, and in CI before `sea:build` / the server unit tests. `vendor/napi-split.ts` throws an actionable error
when the addon is missing.

## Updating

Re-vendor the upstream `release` branch into `tools/font-split/` following its AGENTS.md ("Syncing from upstream"),
rebuild, and rely on `cargo test` plus the real-TTF `sliceFont` unit test as the drift guards.

## Pinned versions

- upstream cn-font-split — `release` @ `1650af13` (= npm 7.6.8 feature set)
- napi-rs — `napi` 3 / `napi-derive` 3, Node-API v10 (`napi10` feature, Node ≥ 22.14), Rust edition 2024
