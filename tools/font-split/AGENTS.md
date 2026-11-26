# @kobato/font-split

Vendored fork of [KonghaYao/cn-font-split](https://github.com/KonghaYao/cn-font-split) (Apache-2.0, `release` branch @
`1650af13`, released as 7.6.8) rebuilt as a Node-API native addon, with two upstream 8.0 fixes ported by hand: the
shaping-relation collection rewrite (`7cb5fcc`) and the order-stable cmap reverse lookup (`7e6d720`). The product
consumes it ONLY through `nativeRequire('@kobato/font-split/font-split.node')`
(`packages/server/src/infra/sea/native-require.ts`) — product src never statically imports this package, so the tools
boundary in `package-dag.test.ts` is untouched. The root `package.json` declares it as a production dependency per the
"native-dynamic-library at runtime lives in ROOT dependencies" convention. Measured results — the λ retune, the
page-cost frontier, loading time, build-profile and encoder evaluations — live in `BENCHMARK.md`; the design rationale
and its revisions live in [ADR-0010](../../docs/adr/0010-frequency-ordered-byte-aware-font-slicing.md).

## Layout

ONE Rust crate (`kobato-font-split`, cdylib + rlib at the package root) — the upstream multi-crate workspace was merged:

- `src/` — the slicing core (upstream root crate): `pre_subset/` → `run_subset.rs` → `link_subset/` (result.css), plus
  the upstream helper crates as modules: `utils.rs` (cn-font-utils), `unicode/` (unicode-range + lang_unicodes merged:
  `range.rs` = UnicodeRange, `mod.rs` = script areas, `cjk.rs` = tables + touch probabilities + algorithm fingerprint).
  Protobuf fully removed: `src/config.rs` (`FontSplitConfig`/`CssProperties`) replaces `InputTemplate`, `src/output.rs`
  (`OutputFile`) replaces `EventMessage`; `font_split(config, callback)` is the only entry.
- `src/pre_subset/` — the partition pipeline, one plugin per stage in a fixed order:
  - `plugins.rs` — language-area packs, then the remainder pack. A pack's language tag is pushed next to it
    (`PreSubsetContext::subset_languages`, position-aligned with the subsets) and every plugin keeps the two aligned;
    the tag selects the DP byte cap (`auto_chunk::cap_bytes`), never a position lookup.
  - `auto_chunk.rs` — the DP chunker, run per pack. Each pack is probed with a strided sample of ≈100 characters
    (`sample_of`), compressed at woff2 quality 9 (`PROBE_QUALITY`, ≈27× cheaper than the shipped quality on the same
    faces). The probes are rescaled to shipped bytes with one quality-9/quality-11 pair on a pooled sample of ≈120
    characters drawn from every pack (`reference_share` / `take_share`, `probe_scale`): the q11/q9 ratio is a font-level
    constant (within ±1% for 80% of faces), so it replaces a quality-11 probe per pack, which cost +25% slicing time,
    and costs no more than the old font-wide quality-11 sample. On the fixture font this reproduces the per-pack
    quality-11 output byte for byte. `dp_split_by_prob` minimizes `Σ P(touched)·(bytes+λ)+μ` under the pack's cap
    (`tests/auto_chunk.rs`). One global bytes/char must not come back: it overstated Latin, symbol and punctuation packs
    ≈5× and cut them into more faces than their bytes justify (28 → 17 non-Han faces on the production font; ADR-0010,
    2026-11-26 revision). `pre_subset::predict_bytes` rejects `chunk_size <= 0` instead of slicing one character per
    face.
  - `features.rs` — the shaping closure, run AFTER chunking: every GSUB/GPOS relation is hoisted whole into the first
    intersecting subset. `features/opentype.rs` holds the shared reading primitives — Extension lookups (GSUB type 7 /
    GPOS type 9) are expanded up to `MAX_EXTENSION_DEPTH`, pair adjustments contribute both sides, ligatures their first
    component — and `cmap.rs` injects the glyph → codepoint reverse lookup in descending codepoint order, so a glyph
    mapped from several codepoints resolves deterministically. Combining marks are deliberately NOT copied into every
    subset (upstream 8.0 `5cdc0ae`): +14% package bytes on the production font for no page-cost gain, and it breaks the
    exactly-once coverage invariant of `chunk_integrity.rs` / `page_cost.rs`.
- `src/unicode/cjk_tables.rs` — @generated CJK priority tables (Kobato-owned, replacing the upstream OpenCC-derived
  data; each vendored list's provenance lives in `scripts/cjk-tables/`). Regenerate with `pnpm run corpus:generate` from
  the official character lists plus the committed corpus frequency TSVs `freq-zhwiki-20261101-{hans,hant}.tsv` (produced
  by `corpus build`). Pack MEMBERSHIP is exactly the official lists; the ORDER inside each pack is corpus
  document-frequency, carried per character by the `*_DF` arrays the DP chunker consumes as touch probabilities. The
  subsets carry tags `ZH_SC_1/2/3`, `ZH_HK`, `ZH_TW`, `ZH_JA`.
- `src/binding.rs` — the napi-rs binding (upstream `ffi-js` reimplemented). `fontSplit(input, options?)` returns a
  Promise (napi `Task`/`AsyncTask` on the libuv pool; core rayon parallelism unchanged). Core panics are caught and
  rethrown as JS errors. napi-rs 3 with the `napi10` feature (Node-API v10, the Node 26 baseline); options arrive as a
  `#[napi(object)]` camelCase struct.
- `build.rs` — `napi_build::setup()` plus one compile-time env, `OUTPUT_DEP_VERSIONS`: the `Cargo.lock` versions of the
  two dependencies that shape output bytes (`harfbuzz_rs_now`, `woff`), hashed into the algorithm fingerprint so a
  dependency upgrade can never reuse stale slice keys. No data is generated at build time (the upstream
  `lang_unicodes/build.rs` data generation, incl. the opencc-rs/cmake chain, is gone).
- `src/binding.d.ts` — @generated by `napi build` from the `binding.rs` macros (the `--dts` flag): the single source of
  truth for the addon's TS types, committed and exported as `@kobato/font-split/binding`. Regenerated on every build —
  never hand-edit; the header (pinned via `napi.dtsHeader` in `package.json`) carries the `oxlint-disable` /
  `oxfmt-ignore` opt-outs itself, so the root lint/format configs need no ignorePatterns entry.
- `src/index.ts` — thin wrapper typed from `src/binding.d.ts` (no hand-written type mirror): `fontSplit` /
  `fontSplitAlgorithmVersion` pass the native signatures through, lazy-loading `font-split.node` with an actionable
  error when missing. It and the generated `binding.d.ts` are the only TS here; `tsconfig.json` is the standard package
  shape. The package is Rust: every tool lives in the crate, never in a TS/JS script.
- `font-split.node` (package root, gitignored) — the addon binary, built and placed by `@napi-rs/cli`
  (`napi build --release --output-dir .`); the stable specifier both `nativeRequire` and SEA staging rely on. The file
  name comes from `napi.binaryName` in `package.json`. The CLI always compiles with `--target <host triple>`, so cargo
  intermediates land in `target/<triple>/release/` (the `corpus:*` scripts still use `target/release/`). The release
  profile is fat LTO + `codegen-units = 1` + `strip = "symbols"` (BENCHMARK.md: −4% slicing time, −21% addon size).
- `src/bin/corpus/` + `src/corpus/` — the data-generation pipeline behind Cargo feature `corpus` (never compiled into
  the addon or CI builds; `opencc-fmmseg`/`memchr` are optional deps). The lib module holds the logic (so
  `tests/corpus.rs` can reach it); the bin is a thin CLI shim. Subcommands: `download` (fetch the pinned zhwiki dump
  into gitignored `.cache/`, resumable), `build` (one streaming pass: wikitext clean → OpenCC t2s/s2t → per-dimension
  char document frequencies → `scripts/cjk-tables/freq-zhwiki-20261101-{hans,hant}.tsv`, held-out page fixtures →
  `tests/fixtures/pages/zh-{hans,hant}-heldout-64.txt` with fixture pages EXCLUDED from the counts), `generate`
  (vendored lists + frequency TSVs → `cjk_tables.rs`), `blog-pages` (the production-blog page fixture: exports the
  published post/page bodies of a Kobato content database and projects each to the codepoints the public theme renders
  in the post font slot — text outside `pre`/`code`, form controls, svg and MathML, plus ordered-list markers, stored as
  codepoint sets only; fails on any entity or tag shape it does not model). Like `curl` and `bzip2`, it shells out to
  system tools (`sqlite3 -readonly`, `date`) instead of taking a dependency. Never runs in CI: `download`/`build` need
  the 3.4 GB local dump. Its tests run via `pnpm run corpus:test`.
- `tests/` — ALL Rust tests live here (`src/` carries no `#[cfg(test)]`): one file per covered module running in CI via
  `cargo test`, the end-to-end gate `chunk_integrity.rs` (slices the fixture font and checks every chunk against its CSS
  contract), the failure gate `failure_paths.rs` (a font built from the fixture: empty or arbitrary input and a
  truncated woff2 fail fast, a font without GSUB or GPOS still slices, an unreadable cmap and `chunk_size <= 0` are
  rejected) and two local-only baseline/benchmark suites:
  - `tests/page_cost.rs` — the page-cost harness: three `#[ignore]`d tests serialized on one mutex (the sweep mutates
    process-global DP parameters), run with `cargo test --release -- --ignored --nocapture page_cost`. The pinned
    baseline moves in the SAME commit as an algorithm change; the per-font report (`FONT_SPLIT_BENCH_FONT` /
    `FONT_SPLIT_BENCH_PACKAGE`, `pnpm run pagecost:report`) and the λ/μ sweep (feature `bench`,
    `pnpm run pagecost:sweep`) are unpinned diagnostics.
  - `tests/corpus.rs` — the corpus pipeline tests, `#![cfg(feature = "corpus")]`-gated (`pnpm run corpus:test`). Not
    CI-run: the pipeline itself is local-only. Tests reach internals through `#[doc(hidden)] pub` seams — the addon's
    real public surface stays `font_split` + config/output types.
- `tests/fixtures/` — `fonts/NotoSansCJKsc-Regular-zh-l1.woff2` (OFL-licensed Noto Sans CJK SC subset; provenance and
  regeneration in its `LICENSE.md`) and `pages/*` page corpora as sorted codepoint sets — the held-out zhwiki pages
  (excluded from the frequency counts) and a production-blog snapshot (independent of the training corpus); provenance
  in the file headers.

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

- `pnpm --filter @kobato/font-split run build` — `napi build --release --output-dir .` (`@napi-rs/cli`): builds the
  cdylib, places it at `font-split.node`, and regenerates `src/binding.d.ts`. Required once per machine before
  `pnpm dev` / server tests touch font slicing, and in CI before `sea:build`. Requires a stable Rust toolchain
  (`rust-toolchain.toml`) and a C++ compiler.
- `pnpm --filter @kobato/font-split run test` — `cargo test`.
- `pnpm --filter @kobato/font-split run lint` — `cargo fmt --check`, then `cargo clippy --all-targets -- -D warnings`;
  CI runs it after the tests.
- `pnpm --filter @kobato/font-split run pagecost:report` — the page-cost report of every page corpus for one real font
  (local only: needs `data/fonts/calendar.ttf` or `FONT_SPLIT_BENCH_FONT`).
- `pnpm --filter @kobato/font-split run pagecost:sweep` — the DP λ/μ sweep on that font (`--features bench`; local
  only); the retuning evidence comes from this run.
- `pnpm --filter @kobato/font-split run fixture:blog <kobato.db> <out>` — regenerate the production-blog page fixture
  through the `corpus` bin from a Kobato content database (local only; opened read-only via the system `sqlite3`, so
  hand it a copy together with its `-wal`; a new snapshot needs re-pinning the `blog` baseline).
- `pnpm --filter @kobato/font-split run corpus:download` / `corpus:build` — fetch the pinned zhwiki dump and run the
  one-pass frequency/fixture build (local only, never CI).
- `pnpm --filter @kobato/font-split run corpus:generate` — regenerate `src/unicode/cjk_tables.rs` via the `corpus` bin
  after changing the vendored lists or frequency TSVs in `scripts/cjk-tables/`; the generator enforces the official
  table sizes (3500/3000/1605, 2026 hangul).
- `pnpm --filter @kobato/font-split run corpus:test` — the corpus pipeline unit tests
  (`cargo test --features corpus --test corpus`).
- `pnpm --filter @kobato/font-split run corpus:update` — full table-update flow: generate, then
  `cargo test --features corpus` (default `cargo test` never compiles the corpus pipeline code), then rebuild
  `font-split.node`.

## Syncing from upstream

Re-vendor the upstream `release` branch's core `src/` and the helper crates (`cn-font-utils`, `unicode-range`) into the
flat layout above, then re-apply the transformations: no `cn_font_proto`/`prost` imports, config/output types from
`src/config.rs`/`src/output.rs`, no reporter/gen_svg/test_html/subsets call sites, helper imports rewritten to
`crate::{utils,unicode}`. The CJK tables are NOT synced anymore: they are Kobato-owned (`unicode/cjk_tables.rs` +
`unicode/cjk.rs` + `src/corpus/`). The script areas in `unicode/mod.rs` mirror upstream except six corrections: Lisu and
Vai point at their real Unicode blocks, and HANI, LAHU, ZHUANG and NAXI_DONGBA are gone (their ranges named unrelated
blocks, and three of the scripts have no Unicode block at all), so `create_default_unicode_area()` has 32 areas.
`src/pre_subset/` is Kobato-owned as a whole — re-vendoring it would drop the DP chunker, the per-pack probes and the
shaping closure; take upstream fixes from that directory by hand. `cargo test` plus the server-side real-TTF
`slice.test.ts` are the drift guards.
