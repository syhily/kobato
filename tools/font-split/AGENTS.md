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
- `src/lang_unicodes/cjk_tables.rs` — @generated CJK priority tables (Kobato-owned, replaces the upstream OpenCC-derived
  data). Regenerate with `pnpm run cjk-tables:generate` from the vendored official character lists in
  `scripts/cjk-tables/`: 中国大陆《通用规范汉字表》一/二/三级 (3500/3000/1605), then 香港《常用字字形表》,
  臺灣《常用國字標準字體表》+《次常用國字標準字體表》 (the ※-marked 待考正字/unit symbols excluded), and
  日本《常用漢字表》(2010, covers the common 和制汉字/kokuji) supplements, each deduplicated against all earlier packs;
  the 韩语高频音节表 (2026, corpus-frequency order) packs as-is. The subsets carry tags `ZH_SC_1/2/3`, `ZH_HK`, `ZH_TW`,
  `ZH_JA` (was `ZH_SC` + an OpenCC-derived `ZH_TC` upstream).
- `src/binding.rs` — the napi-rs binding (upstream `ffi-js` reimplemented). `fontSplit(input, options?)` returns a
  Promise (napi `Task`/`AsyncTask` on the libuv pool; core rayon parallelism unchanged). Core panics are caught and
  rethrown as JS errors. napi-rs 3 with the `napi10` feature (Node-API v10, the Node 26 baseline); options arrive as a
  `#[napi(object)]` camelCase struct.
- `build.rs` — `napi_build::setup()` only; nothing is generated at build time (the upstream `lang_unicodes/build.rs`
  data generation, incl. the opencc-rs/cmake chain, is gone).
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
- Build prerequisites are a stable Rust toolchain and a C++ compiler only (harfbuzz_rs_now and woff compile their
  vendored C/C++ via `cc`); cmake is NOT required since the opencc-rs build script was removed.

## Trimmed vs upstream

Removed: protobuf (`crates/proto`, prost/tonic-build), all other bindings (`packages/ffi*`, `ffi-py`, `grpc`, `wasmer`,
`wasm-edge`, `vite`), the CLI bin + clap, preview-image SVG (`gen_svg`), test-HTML emission, `reporter.bin` /
`OutputReport`, user-defined `subsets`, `polyfill`, the `with_extra` feature split (always on), config fields nothing
reads (`out_dir`, `target_type`, `build_mode`, `multi_threads`, `chunk_size_tolerance`, `max_allow_subsets_count`), the
OpenCC-based build-time traditional-char derivation (replaced by official regional character lists), and the
`regex`/`lazy_static` crates (hand-rolled name-template parser + `std::sync::LazyLock`). Disk-fixture tests referencing
the upstream demo fonts were dropped. Output = `result.css` + `*.woff2` only.

## Commands

- `pnpm --filter @kobato/font-split run build` — `cargo build --release` + copy to `font-split.node`. Required once per
  machine before `pnpm dev` / server tests touch font slicing, and in CI before `sea:build`. Requires a stable Rust
  toolchain (`rust-toolchain.toml`) and a C++ compiler.
- `pnpm --filter @kobato/font-split run test` — `cargo test`.
- `pnpm --filter @kobato/font-split run cjk-tables:generate` — regenerate `src/lang_unicodes/cjk_tables.rs` after
  changing the vendored lists in `scripts/cjk-tables/`; the generator enforces the official table sizes (3500/3000/1605,
  2026 hangul).
- `pnpm --filter @kobato/font-split run cjk-tables:update` — full table-update flow: generate, then `cargo test`, then
  rebuild `font-split.node`.

## Syncing from upstream

Re-vendor the upstream `release` branch's core `src/` and the helper crates (`cn-font-utils`, `unicode-range`) into the
flat layout above, then re-apply the transformations: no `cn_font_proto`/`prost` imports, config/output types from
`src/config.rs`/`src/output.rs`, no reporter/gen_svg/test_html/subsets call sites, helper imports rewritten to
`crate::{utils,unicode_range,lang_unicodes}`. `lang_unicodes` is NOT synced anymore: its CJK tables are Kobato-owned
(`cjk_tables.rs` + `scripts/gen-cjk-tables.ts`); only the range-based script areas (latin/greek/etc.) mirror upstream.
`cargo test` plus the server-side real-TTF `slice.test.ts` are the drift guards.
