# @kobato/font-split

Vendored fork of [KonghaYao/cn-font-split](https://github.com/KonghaYao/cn-font-split) (Apache-2.0, `release` branch @
`1650af13`, released as 7.6.8) rebuilt as a Node-API native addon. The product consumes it ONLY through
`nativeRequire('@kobato/font-split/font-split.node')` (`packages/server/src/infra/sea/native-require.ts`) — product src
never statically imports this package, so the tools boundary in `package-dag.test.ts` is untouched. The root
`package.json` declares it as a production dependency per the "native-dynamic-library at runtime lives in ROOT
dependencies" convention.

## Layout

ONE Rust crate (`kobato-font-split`, cdylib + rlib at the package root) — the upstream multi-crate workspace was merged:

- `src/` — the slicing core (upstream root crate): `pre_subset` → `run_subset` → `link_subset` (result.css), plus the
  upstream helper crates as modules: `utils.rs` (cn-font-utils), `unicode_range.rs`, `lang_unicodes/`. Protobuf fully
  removed: `src/config.rs` (`FontSplitConfig`/`CssProperties`) replaces `InputTemplate`, `src/output.rs` (`OutputFile`)
  replaces `EventMessage`; `font_split(config, callback)` is the only entry.
- `src/binding.rs` — the napi-rs binding (upstream `ffi-js` reimplemented). `fontSplit(input, options?)` returns a
  Promise (napi `Task`/`AsyncTask` on the libuv pool; core rayon parallelism unchanged). Core panics are caught and
  rethrown as JS errors. napi-rs 3 with the `napi10` feature (Node-API v10, the Node 26 baseline); options arrive as a
  `#[napi(object)]` camelCase struct.
- `build.rs` — `napi_build::setup()` + the upstream `lang_unicodes/build.rs` data generation (`data/*.dat` from
  `scripts/syl-2.txt` + opencc-rs; needs cmake + a C++ toolchain). `data/` is gitignored.
- `src/index.ts` — typed TS wrapper: `fontSplit(props): Promise<FontSplitOutputFile[]>`, lazy-loads `font-split.node`
  with an actionable error when missing.
- `scripts/copy-addon.ts` — renames the cdylib to the stable `font-split.node` at the package root (the specifier both
  `nativeRequire` and SEA staging rely on); run via Node 26 type stripping.
- `examples/slice.rs` — dev smoke for the core (`cargo run --release --example slice -- <font>`).

## Toolchain pins

- Rust edition **2024** (`Cargo.toml` + `rustfmt.toml`); stable toolchain via `rust-toolchain.toml`.
- `.cargo/config.toml` sets `HARFBUZZ_SYS_NO_PKG_CONFIG=1` — without it `harfbuzz_rs_now` links the SYSTEM harfbuzz via
  pkg-config (segfaults in tests and leaves a Homebrew dylib dependency in the addon, breaking SEA distribution); the
  flag forces the vendored, statically linked harfbuzz so `font-split.node` stays self-contained.

## Trimmed vs upstream

Removed: protobuf (`crates/proto`, prost/tonic-build), all other bindings (`packages/ffi*`, `ffi-py`, `grpc`, `wasmer`,
`wasm-edge`, `vite`), the CLI bin + clap, preview-image SVG (`gen_svg`), test-HTML emission, `reporter.bin` /
`OutputReport`, user-defined `subsets`, `polyfill`, the `with_extra` feature split (always on), and config fields
nothing reads (`out_dir`, `target_type`, `build_mode`, `multi_threads`, `chunk_size_tolerance`,
`max_allow_subsets_count`). Disk-fixture tests referencing the upstream demo fonts were dropped. Output = `result.css`

- `*.woff2` only.

## Commands

- `pnpm --filter @kobato/font-split run build` — `cargo build --release` + copy to `font-split.node`. Required once per
  machine before `pnpm dev` / server tests touch font slicing, and in CI before `sea:build`. Requires a stable Rust
  toolchain (`rust-toolchain.toml`), cmake, and a C++ compiler.
- `pnpm --filter @kobato/font-split run test` — `cargo test`.

## Syncing from upstream

Re-vendor the upstream `release` branch's core `src/` and the helper crates (`cn-font-utils`, `lang_unicodes` incl.
`build.rs` + `scripts/`, `unicode-range`) into the flat layout above, then re-apply the transformations: no
`cn_font_proto`/`prost` imports, config/output types from `src/config.rs`/`src/output.rs`, no reporter/gen_svg/
test_html/subsets call sites, helper imports rewritten to `crate::{utils,unicode_range,lang_unicodes}`. `cargo test`
plus the server-side real-TTF `slice.test.ts` are the drift guards; the `ZH_TC` pin in
`src/lang_unicodes/cjk_unicodes.rs` floats with the opencc-rs version.
