# @kobato/font-split

Vendored fork of [KonghaYao/cn-font-split](https://github.com/KonghaYao/cn-font-split) (Apache-2.0, `release` branch @
`1650af13`, released as 7.6.8) rebuilt as a Node-API native addon. The product consumes it ONLY through
`nativeRequire('@kobato/font-split/font-split.node')` (`packages/server/src/infra/sea/native-require.ts`) — product src
never statically imports this package, so the tools boundary in `package-dag.test.ts` is untouched. The root
`package.json` declares it as a production dependency per the "native-dynamic-library at runtime lives in ROOT
dependencies" convention.

## Layout

ONE Rust crate (`kobato-font-split`, cdylib + rlib at the package root) — the upstream multi-crate workspace was merged:

- `src/` — the slicing core (upstream root crate): `pre_subset/` → `run_subset.rs` → `link_subset/` (result.css), plus
  the upstream helper crates as modules: `utils.rs` (cn-font-utils), `unicode/` (unicode-range + lang_unicodes merged:
  `range.rs` = UnicodeRange, `mod.rs` = script areas, `cjk.rs` = tables + touch probabilities + algorithm fingerprint).
  Protobuf fully removed: `src/config.rs` (`FontSplitConfig`/`CssProperties`) replaces `InputTemplate`, `src/output.rs`
  (`OutputFile`) replaces `EventMessage`; `font_split(config, callback)` is the only entry.
- `src/unicode/cjk_tables.rs` — @generated CJK priority tables (Kobato-owned, replaces the upstream OpenCC-derived
  data). Regenerate with `pnpm run cjk-tables:generate` from the vendored official character lists in
  `scripts/cjk-tables/` PLUS the corpus frequency TSVs `scripts/cjk-tables/freq-zhwiki-20261101-{hans,hant}.tsv`
  (produced by `datagen build`, committed): 中国大陆《通用规范汉字表》一/二/三级 (3500/3000/1605), then
  香港《常用字字形表》, 臺灣《常用國字標準字體表》+《次常用國字標準字體表》 (the ※-marked 待考正字/unit symbols
  excluded), and 日本《常用漢字表》(2010, covers the common 和制汉字/kokuji) supplements, each deduplicated against all
  earlier packs; the 韩语高频音节表 (2026, corpus-frequency order) packs as-is. Pack MEMBERSHIP is exactly the official
  lists; the ORDER inside each pack is corpus document-frequency (ADR-0010), and the parallel `*_DF` arrays carry the
  per-character document count the DP chunker consumes as touch probabilities. The subsets carry tags `ZH_SC_1/2/3`,
  `ZH_HK`, `ZH_TW`, `ZH_JA` (was `ZH_SC` + an OpenCC-derived `ZH_TC` upstream).
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
- `src/bin/datagen/` + `src/datagen/` — the data-generation pipeline behind Cargo feature `corpus` (never compiled into
  the addon or CI builds; `jieba-rs`/`opencc-fmmseg`/`memchr` are optional deps). The lib module holds the logic (so
  `tests/datagen.rs` can reach it); the bin is a thin CLI shim. Subcommands: `download` (fetch the pinned zhwiki dump
  into gitignored `.cache/`, resumable), `build` (one streaming pass: wikitext clean → OpenCC t2s/s2t → per-dimension
  char document frequencies → `scripts/cjk-tables/freq-zhwiki-20261101-{hans,hant}.tsv`, held-out page fixtures →
  `tests/fixtures/pages/zh-{hans,hant}-heldout-64.txt` with fixture pages EXCLUDED from the counts, word frequencies →
  gitignored `out/`), `generate` (vendored lists + frequency TSVs → `cjk_tables.rs`). Never runs in CI:
  `download`/`build` need the 3.4 GB local dump. Its tests run via `pnpm run corpus:test`.
- `tests/` — ALL Rust tests live here (`src/` carries no `#[cfg(test)]`): one file per covered module (`auto_chunk.rs`,
  `features.rs`, `link_subset.rs`, `unicode.rs`, `range.rs`, `utils.rs`, …) running in CI via `cargo test`, plus the two
  baseline/benchmark suites that never run in CI:
  - `tests/page_cost.rs` — the page-cost harness: runs the real pipeline on the CJK fixture font, parses `result.css`,
    and pins the current algorithm's page-cost metrics (bytes + chunk count a page would download under CSS
    `unicode-range`) in BOTH script dimensions (hans/hant fixtures), plus coverage/disjointness invariants. Both tests
    are `#[ignore]`d — run `cargo test --release -- --ignored --nocapture page_cost`, verify the new metrics are the
    intended improvement, and update the constants in the same commit as the algorithm change.
  - `tests/datagen.rs` — the datagen pipeline tests, `#![cfg(feature = "corpus")]`-gated (`pnpm run corpus:test`). Not
    CI-run: the pipeline itself is local-only. Tests reach internals through `#[doc(hidden)] pub` seams (`loader`,
    `link_subset::css`, `pre_subset::auto_chunk`, `unicode::cjk_tables`, …) — the addon's real public surface stays
    `font_split` + config/output types.
- `tests/fixtures/` — `fonts/NotoSansCJKsc-Regular-zh-l1.woff2` (OFL-licensed subset of Noto Sans CJK SC covering ASCII,
  the `ZH_SYMBOL` set, and the full 通用规范汉字表 一级字表; provenance and regeneration details in its `LICENSE.md`)
  and `pages/zh-{hans,hant}-heldout-64.txt` (64 held-out pages per script dimension as sorted codepoint sets; produced
  by `datagen build` from the pinned zhwiki dump and EXCLUDED from the frequency counts; provenance in the file
  headers).

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
- `pnpm --filter @kobato/font-split run cjk-tables:generate` — regenerate `src/unicode/cjk_tables.rs` via the `datagen`
  bin after changing the vendored lists or frequency TSVs in `scripts/cjk-tables/`; the generator enforces the official
  table sizes (3500/3000/1605, 2026 hangul).
- `pnpm --filter @kobato/font-split run cjk-tables:update` — full table-update flow: generate, then
  `cargo test --features corpus` (default `cargo test` never compiles the datagen code), then rebuild `font-split.node`.
- `pnpm --filter @kobato/font-split run corpus:download` / `corpus:build` — fetch the pinned zhwiki dump and run the
  one-pass frequency/fixture build (local only, never CI). `corpus:test` runs the datagen unit tests.

## Syncing from upstream

Re-vendor the upstream `release` branch's core `src/` and the helper crates (`cn-font-utils`, `unicode-range`) into the
flat layout above, then re-apply the transformations: no `cn_font_proto`/`prost` imports, config/output types from
`src/config.rs`/`src/output.rs`, no reporter/gen_svg/test_html/subsets call sites, helper imports rewritten to
`crate::{utils,unicode}`. The CJK tables are NOT synced anymore: they are Kobato-owned (`unicode/cjk_tables.rs` +
`unicode/cjk.rs` + `src/datagen/`); only the range-based script areas in `unicode/mod.rs` mirror upstream. `cargo test`
plus the server-side real-TTF `slice.test.ts` are the drift guards.
